import {observeMessages, waitForMessage} from './messages.js';
import {isAdShowing, observeAdState, waitForContent} from './utils.js';
import {fetchPanelCaptions} from './panelCaptions.js';

export type Caption = {start: number; end: number; text: string};

const captionButtonSelector =
  'button.ytp-subtitles-button, .ytm-closed-captioning-button, ' +
  'button.ytmClosedCaptioningButtonButton';

/**
 * Convert YouTube's JSON captions into text with start/end times in seconds.
 * A line can arrive in several pieces, especially for automatic captions. Join
 * those pieces and skip entries that contain no text.
 */
export function parseCaptions(data: {
  events?: Array<{
    tStartMs: number;
    dDurationMs?: number;
    segs?: Array<{utf8: string}>;
  }>;
}): Caption[] {
  const events = data.events ?? [];
  return events.flatMap((evt, index) => {
    const text = evt.segs?.map((seg) => seg.utf8).join('')
      .replace(/\s+/g, ' ').trim();
    if (!text || !Number.isFinite(evt.tStartMs)) return [];
    const next = events[index + 1]?.tStartMs;
    const end = evt.tStartMs + (evt.dDurationMs ?? 5000);
    return [{start: evt.tStartMs / 1000,
      end: Math.min(end, next ?? end) / 1000, text}];
  }).filter((cue) => cue.end > cue.start);
}

/** Prefer manually supplied captions over automatically generated captions. */
export function getPreferredCaptionTrack(
  tracks: YTCaptionTrack[], lang: string,
): YTCaptionTrack | undefined {
  return tracks.filter((track) => track.languageCode === lang)
    .sort((a, b) => Number(a.kind === 'asr') - Number(b.kind === 'asr'))[0];
}

export class CaptionResponseError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'CaptionResponseError';
  }
}

function readCaptionBody(body: string): Caption[] {
  if (!body.trim()) {
    throw new CaptionResponseError(
      'YouTube returned an empty caption response.',
    );
  }
  let data;
  try { data = JSON.parse(body); } catch {
    throw new CaptionResponseError('YouTube returned invalid caption JSON.');
  }
  if (!Array.isArray(data?.events)) {
    throw new CaptionResponseError('YouTube returned invalid caption data.');
  }
  try {
    const captions = parseCaptions(data);
    if (!captions.length) throw Error();
    return captions;
  } catch {
    throw new CaptionResponseError('YouTube returned invalid caption data.');
  }
}

/** Read a successful YouTube caption response, optionally for a specific track.
 * Accept usable captions even if YouTube did not need a token for that request.
 */
export function nativeCaptions(
  response: CaptionResponse, track?: YTCaptionTrack,
): Caption[] | undefined {
  if (response?.status !== 200 || response.outcome !== 'load') return;
  if (track) {
    const base = new URL(track.baseUrl, location.href);
    if (response.params.lang !== track.languageCode || response.params.tlang ||
        (response.params.kind ?? '') !==
          (base.searchParams.get('kind') ?? track.kind ?? '') ||
        (response.params.name ?? '') !==
          (base.searchParams.get('name') ?? '')) return;
  }
  try {
    const captions = readCaptionBody(response.body);
    return captions.length ? captions : undefined;
  } catch { return undefined; }
}

/** Retry connection failures, but stop on HTTP errors or unusable responses. */
export async function fetchCaptionTrack(
  url: URL | (() => URL), signal: AbortSignal,
  headers: Record<string, string> = {},
  transport?: (url: URL, signal: AbortSignal) => Promise<Response>,
): Promise<Caption[]> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const target = typeof url === 'function' ? url() : url;
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(() => controller.abort(
      new Error('Caption request timed out')), 10000);
    try {
      const response = transport ? await transport(target, controller.signal) :
        await fetch(target, {
          signal: controller.signal, credentials: 'include', headers,
        });
      if (!response.ok) {
        throw new CaptionResponseError(
          `Caption request failed: HTTP ${response.status}`, response.status,
        );
      }
      return readCaptionBody(await response.text());
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof CaptionResponseError || attempt >= 2) throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
    await delay(1000 * (attempt + 1), signal);
  }
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, {once: true});
  });
}

/** Change the requested language/track while preserving YouTube's signed URL.
 * YouTube verifies the values named in sparams using its signature. Changing
 * one of those values would invalidate the request.
 */
export function createCaptionURL(
  track: YTCaptionTrack, params: Record<string, string>, translation?: string,
): URL {
  const base = new URL(track.baseUrl, location.href);
  const url = new URL(base.pathname, base.origin);
  url.search = new URLSearchParams(params).toString();
  const signed = (params.sparams ?? '').split(',');
  for (const [key, value] of Object.entries({
    lang: base.searchParams.get('lang') ?? track.languageCode,
    kind: base.searchParams.get('kind') ?? track.kind,
    name: base.searchParams.get('name'),
    tlang: translation,
    fmt: 'json3',
  })) {
    if (signed.includes(key) && url.searchParams.get(key) !== (value ?? null)) {
      throw new Error(`Cannot change signed caption parameter: ${key}`);
    }
    if (value == null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url;
}

/** Ask the page-side script to fetch captions using a saved YouTube request.
 * Send its reference number rather than its account-related headers. The page
 * script keeps those headers private; this script checks the returned data.
 */
async function replayCaptionTrack(
  context: CaptionResponse, track: YTCaptionTrack, signal: AbortSignal,
  translation?: string,
): Promise<Caption[]> {
  const url = createCaptionURL(track, context.params, translation);
  return fetchCaptionTrack(url, signal, {}, async (target, attemptSignal) => {
    attemptSignal.throwIfAborted();
    const random = crypto.getRandomValues(new Uint32Array(4));
    const operationId = [...random].join('-');
    const pending = waitForMessage<CaptionReplayResponse>(
      'CAPTION_REPLAY_RESPONSE', attemptSignal,
      (response) => response?.operationId === operationId, 12000,
    );
    const selection = Object.fromEntries(
      ['lang', 'kind', 'name', 'tlang', 'fmt'].map(
        (key) => [key, target.searchParams.get(key)],
      ),
    );
    postMessage({
      origin: 'EASY_LANGUAGES_DICT_EXT', type: 'CAPTION_REPLAY_REQUEST',
      content: {operationId, requestId: context.id, selection},
    }, location.origin);
    try {
      const response = await pending;
      if (response.error) throw new CaptionResponseError(response.error);
      return new Response(response.body, {status: response.status});
    } catch (error) {
      // If the saved request has expired or been rejected, repeating it is not
      // the same as retrying a lost connection. Report the failure instead.
      throw new CaptionResponseError(error instanceof Error ? error.message :
        'Native caption request failed.');
    } finally {
      postMessage({origin: 'EASY_LANGUAGES_DICT_EXT',
        type: 'CAPTION_REPLAY_CANCEL', content: {operationId},
      }, location.origin);
    }
  });
}

type NativeEnglish = {id: number; captions: Caption[]};

function nativeEnglish(response: CaptionResponse): NativeEnglish | undefined {
  // tlang is the requested translation language. For example, lang=en with
  // tlang=fr produces French, so it must not supply our English line.
  const language = response.params.tlang || response.params.lang;
  if (!/^en(?:-|$)/i.test(language ?? '')) return;
  const captions = nativeCaptions(response);
  return captions ? {id: response.id, captions} : undefined;
}

async function translateCaptions(
  initial: CaptionResponse, track: YTCaptionTrack, signal: AbortSignal,
  cachedEnglish?: NativeEnglish,
  preferredEnglishTrack?: YTCaptionTrack,
): Promise<Caption[]> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener('abort', abort, {once: true});
  let latest = initial;
  let english = cachedEnglish;
  let limited = false;
  observeMessages<CaptionResponse>('CAPTION_RESPONSE', controller.signal,
    (response) => {
      if (response?.params?.v !== initial.params.v) return;
      limited ||= response.status === 429;
      if (response.id > latest.id && nativeCaptions(response)) {
        latest = response;
      }
      const candidate = nativeEnglish(response);
      if (candidate && (!english || candidate.id > english.id)) {
        english = candidate;
      }
    });
  try {
    await delay(1000, controller.signal);
    await waitForContent(controller.signal);
    if (english) return english.captions;
    if (limited) {
      throw new CaptionResponseError('YouTube rate limited captions.', 429);
    }
    return await replayCaptionTrack(latest, preferredEnglishTrack ?? track,
      controller.signal, preferredEnglishTrack ? undefined : 'en');
  } finally {
    controller.abort();
    signal.removeEventListener('abort', abort);
  }
}

/** Obtain captions from YouTube's downloads before making additional requests.
 * An empty response may mean the request was not ready to use. Let the player
 * prepare a request again instead of immediately repeating the failed URL.
 */
async function fetchNativeCaptions(
  track: YTCaptionTrack, signal: AbortSignal,
  preferredEnglishTrack?: YTCaptionTrack,
  rememberEnglish?: (captions: Caption[]) => void,
): Promise<{
  captions: Caption[];
  translatedCaptions: Promise<Caption[]>;
}> {
  const videoId = new URL(track.baseUrl, location.href).searchParams.get('v');
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener('abort', abort, {once: true});
  let deadline: ReturnType<typeof setTimeout> | undefined;
  // Only count time spent waiting for the actual video. Ads can easily last
  // longer than the normal caption-loading timeout.
  let remaining = 25000;
  let resumedAt = Date.now();
  observeAdState(showing => {
    if (deadline !== undefined) {
      clearTimeout(deadline);
      deadline = undefined;
      remaining -= Date.now() - resumedAt;
    }
    if (!showing) {
      resumedAt = Date.now();
      deadline = setTimeout(() => controller.abort(new Error(
        'No usable native captions arrived. Try the captions button again.',
      )), Math.max(0, remaining));
    }
  }, controller.signal);
  const active = new Set<number>();
  const completed = new Set<number>();
  const attempted = new Set<string>();
  const emptyContexts = new Set<string>();
  let captions: Caption[] | undefined;
  let context: CaptionResponse | undefined;
  let english: NativeEnglish | undefined;
  let lastCompleted = -1;
  let lastCompletionTime = 0;
  let limited = false;
  let mayReactivate = true;
  let userChangedCaptions = false;
  observeMessages<CaptionRequest>('CAPTION_REQUEST', controller.signal,
    (request) => {
      if (request?.params?.v === videoId && !completed.has(request.id)) {
        active.add(request.id);
      }
    });
  observeMessages<CaptionResponse>('CAPTION_RESPONSE', controller.signal,
    (response) => {
      if (response?.params?.v !== videoId || completed.has(response.id)) return;
      // The same result can arrive when a download finishes and again when we
      // ask for saved results. Count its ID once so one failure stays one.
      completed.add(response.id);
      active.delete(response.id);
      if (response.id >= lastCompleted) {
        lastCompleted = response.id;
        lastCompletionTime = Date.now();
        limited ||= response.status === 429;
        if (response.status === 200 && !response.body.trim()) {
          const key = JSON.stringify(response.params);
          mayReactivate = !emptyContexts.has(key);
          emptyContexts.add(key);
        }
      }
      const experiment = response.params.exp ?? '';
      const needsToken =
        experiment.includes('xpe') || experiment.includes('xpv');
      // Turning CC off can cancel the download we were waiting for. If its
      // request details are usable, finish ours without turning CC back on.
      const userCancelled = userChangedCaptions &&
        response.outcome === 'abort' &&
        (!needsToken || Boolean(response.params.pot));
      if ((nativeCaptions(response) || userCancelled) &&
          (!context || response.id > context.id)) {
        context = response;
      }
      captions ??= nativeCaptions(response, track);
      const candidate = nativeEnglish(response);
      if (candidate && (!english || candidate.id > english.id)) {
        english = candidate;
        rememberEnglish?.(candidate.captions);
      }
    });
  let button: HTMLElement | null = null;
  let wasOn = false;
  const ownCaptionControl = (event: Event) => {
    if (event.isTrusted && event.target instanceof Element &&
        event.target.closest(captionButtonSelector)) userChangedCaptions = true;
  };
  // Startup can briefly enable YouTube's captions to obtain their request URL
  // and headers. Once the user interacts with CC, preserve their choice instead
  // of restoring the setting we saw earlier.
  for (const type of ['pointerdown', 'click']) {
    document.addEventListener(type, ownCaptionControl,
      {capture: true, signal: controller.signal});
  }
  document.addEventListener('keydown', (event) => {
    if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select'))) {
      return;
    }
    if (event.code === 'KeyC' ||
        (target instanceof Element && target.closest(captionButtonSelector) &&
        ['Space', 'Enter'].includes(event.code))) userChangedCaptions = true;
  }, {capture: true, signal: controller.signal});
  let activations = 0;
  let nextActivation = Date.now() + 1500;
  try {
    postMessage({origin: 'EASY_LANGUAGES_DICT_EXT',
      type: 'CAPTION_STATE_REQUEST', videoId}, location.origin);
    while (!captions || isAdShowing()) {
      controller.signal.throwIfAborted();
      await waitForContent(controller.signal);
      if (captions) break;
      if (limited) {
        throw new CaptionResponseError('YouTube rate limited captions.', 429);
      }
      // Allow the player's first fresh activation, but repeated empty results
      // need not consume the entire startup deadline when a panel is possible.
      if (track.vssId && !mayReactivate && !active.size) {
        throw new CaptionResponseError('Native captions remained empty.');
      }
      // A successful download for another track, or a usable request cancelled
      // by the user, can supply the details for our download. Try each saved
      // request only once.
      if (context && !active.size) {
        const url = createCaptionURL(track, context.params);
        const key = `${context.id}:${url.href}`;
        if (!attempted.has(key)) {
          attempted.add(key);
          try {
            captions = await replayCaptionTrack(context, track,
              controller.signal);
          } catch (error) {
            controller.signal.throwIfAborted();
            if (error instanceof CaptionResponseError && error.status === 429) {
              limited = true;
              if (!captions) throw error;
            }
            if (captions) break;
          }
        }
      }
      if (captions) break;
      const now = Date.now();
      if (!userChangedCaptions && mayReactivate && !active.size &&
          activations < 3 &&
          now >= nextActivation &&
          now - lastCompletionTime >= 2000) {
        const control =
          document.querySelector<HTMLElement>(captionButtonSelector);
        if (control) {
          if (!button) {
            button = control;
            wasOn = control.getAttribute('aria-pressed') === 'true';
          }
          // No caption download is running. Toggling CC asks YouTube to prepare
          // its request again instead of making us resend a saved URL.
          if (control.getAttribute('aria-pressed') === 'true') control.click();
          control.click();
          activations++;
          nextActivation = now + 1000 * 2 ** activations;
        }
      }
      await delay(200, controller.signal);
    }
    const source = context;
    const canTranslate = english ||
      ((preferredEnglishTrack || track.isTranslatable) && !limited);
    const translatedCaptions = canTranslate && source &&
      !track.languageCode.startsWith('en') ?
      translateCaptions(source, track, signal, english, preferredEnglishTrack) :
      limited && !english ? Promise.reject(new CaptionResponseError(
        'YouTube rate limited captions.', 429)) : Promise.resolve([]);
    void translatedCaptions.catch(() => {});
    return {captions, translatedCaptions};
  } finally {
    clearTimeout(deadline);
    controller.abort();
    signal.removeEventListener('abort', abort);
    if (!signal.aborted && !isAdShowing() && !userChangedCaptions &&
        button?.isConnected &&
        (button.getAttribute('aria-pressed') === 'true') !== wasOn) {
      button.click();
    }
  }
}

/** Native acquisition owns CC cleanup. Only after it exits do we request a
 * transcript, with the navigation signal rather than the expired native timer.
 * English has its own failure boundary and never discards working source cues.
 */
export async function fetchCaptions(
  track: YTCaptionTrack, signal: AbortSignal,
  preferredEnglishTrack?: YTCaptionTrack,
): Promise<{captions: Caption[]; translatedCaptions: Promise<Caption[]>}> {
  const fallback = async (selected: YTCaptionTrack | undefined,
    error?: unknown): Promise<Caption[]> => {
    signal.throwIfAborted();
    if (error instanceof CaptionResponseError && error.status === 429) {
      throw error;
    }
    if (!selected?.vssId) {
      if (error) throw error;
      return [];
    }
    await waitForContent(signal);
    return fetchPanelCaptions(selected, signal);
  };
  let result;
  let nativeEnglish: Caption[] | undefined;
  try {
    result = await fetchNativeCaptions(track, signal, preferredEnglishTrack,
      captions => nativeEnglish = captions);
  } catch (error) {
    const captions = await fallback(track, error);
    if (!captions.length) throw error;
    const translatedCaptions = nativeEnglish ? Promise.resolve(nativeEnglish) :
      fallback(preferredEnglishTrack);
    void translatedCaptions.catch(() => {});
    return {captions, translatedCaptions};
  }
  const translatedCaptions = result.translatedCaptions.then(
    cues => cues.length ? cues : fallback(preferredEnglishTrack),
    error => fallback(preferredEnglishTrack, error),
  );
  void translatedCaptions.catch(() => {});
  return {captions: result.captions, translatedCaptions};
}
