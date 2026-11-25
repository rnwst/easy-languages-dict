import {
  encodePanelParams, findPanelParams, parseTranscriptPanel,
} from './transcriptPanel.js';

const origin = 'EASY_LANGUAGES_DICT_EXT';
const maxBytes = 4 * 1024 * 1024;
type Result = Pick<TranscriptPanelResponse, 'captions' | 'outcome'>;

/** A fixed, same-origin MAIN-world transport. Attempts (including failures and
 * cancellation) survive isolated startup retries. Only navigation resets them.
 */
export function installTranscriptPanel(options: {
  root?: Window;
  metadata: (videoId: string) => YTVideoMetadata | undefined;
  context: () => unknown;
  initialData?: () => unknown;
}) {
  const root = options.root ?? window;
  const nativeFetch = root.fetch;
  type Attempt = {
    subscribers: Set<string>;
    result?: Result;
    cancel: () => void;
  };
  let video = new URL(root.location.href).searchParams.get('v');
  let navigating = false;
  let limited = false;
  const attempts = new Map<string, Attempt>();
  const operations = new Map<string, Attempt>();
  const cancelAll = () => {
    for (const attempt of attempts.values()) attempt.cancel();
  };
  const reset = () => {
    cancelAll();
    attempts.clear();
    limited = false;
  };
  const start = () => {
    if (!navigating) reset();
    navigating = true;
  };
  const finishNavigation = () => {
    const next = new URL(root.location.href).searchParams.get('v');
    if (next !== video) reset();
    video = next;
    navigating = false;
  };
  // document events need not bubble; window's capture listener sees them too.
  root.addEventListener('yt-navigate-start', start, true);
  root.addEventListener('yt-navigate-finish', finishNavigation, true);
  root.addEventListener('pagehide', cancelAll);
  const rateLimit = (id: string) => {
    if (id === video) limited = true;
  };
  root.addEventListener('message', (event) => {
    if (event.source !== root || event.origin !== root.location.origin ||
        event.data?.origin !== origin) return;
    const {type, content} = event.data;
    if (type !== 'TRANSCRIPT_PANEL_REQUEST' &&
        type !== 'TRANSCRIPT_PANEL_CANCEL') return;
    const operationId = content?.operationId;
    if (typeof operationId !== 'string' || !operationId ||
        operationId.length > 256) return;
    if (type === 'TRANSCRIPT_PANEL_CANCEL') {
      const attempt = operations.get(operationId);
      operations.delete(operationId);
      attempt?.subscribers.delete(operationId);
      if (attempt && !attempt.subscribers.size) attempt.cancel();
      return;
    }
    if (operations.has(operationId) || operations.size >= 100) return;
    const {videoId, vssId, languageCode, kind} = content;
    const send = (id: string, result: Result) => {
      root.postMessage({origin, type: 'TRANSCRIPT_PANEL_RESPONSE', content: {
        operationId: id, videoId, vssId, ...result,
      }}, root.location.origin);
    };
    const unavailable: Result = {captions: [], outcome: 'unavailable'};
    try {
      const current = new URL(root.location.href).searchParams.get('v');
      if (current !== video && !navigating) finishNavigation();
      if (navigating || typeof videoId !== 'string' || videoId !== video ||
          !videoId || videoId.length > 128 || typeof vssId !== 'string' ||
          !vssId || vssId.length > 512) throw Error();
      const metadata = options.metadata(videoId);
      const tracks = metadata?.captions?.playerCaptionsTracklistRenderer
        .captionTracks;
      // No invented .language identity, translated track, or URL from callers.
      // Ambiguous identities are unsupported even if their language matches.
      const matches = tracks?.filter(track => track.vssId === vssId);
      if (metadata?.videoDetails.videoId !== videoId || matches?.length !== 1 ||
          matches[0].languageCode !== languageCode ||
          (matches[0].kind ?? '') !== kind) throw Error();
    } catch {
      send(operationId, unavailable);
      return;
    }
    const cached = attempts.get(vssId);
    if (cached?.result) {
      send(operationId, cached.result);
      return;
    }
    if (cached) {
      cached.subscribers.add(operationId);
      operations.set(operationId, cached);
      return;
    }
    if (limited || attempts.size >= 32) {
      send(operationId, limited ? {captions: [], outcome: 'rate-limited'} :
        unavailable);
      return;
    }
    const controller = new AbortController();
    const attempt: Attempt = {subscribers: new Set([operationId]),
      cancel: () => {
        complete({captions: [], outcome: 'cancelled'});
        controller.abort();
      }};
    const complete = (result: Result) => {
      if (attempt.result) return;
      attempt.result = result;
      clearTimeout(timer);
      for (const id of attempt.subscribers) {
        operations.delete(id);
        send(id, result);
      }
      attempt.subscribers.clear();
    };
    const timer = setTimeout(attempt.cancel, 10000);
    attempts.set(vssId, attempt);
    operations.set(operationId, attempt);
    void (async () => {
      try {
        const context = options.context();
        if (!context || typeof context !== 'object') throw Error();
        const response = await nativeFetch.call(root,
          '/youtubei/v1/get_panel?prettyPrint=false', {
            method: 'POST', credentials: 'same-origin', redirect: 'error',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({context, panelId: 'PAmodern_transcript_view',
              params: findPanelParams(
                options.initialData?.(), videoId, vssId) ??
                encodePanelParams(videoId, vssId)}),
            signal: controller.signal,
          });
        controller.signal.throwIfAborted();
        if (response.status === 429) {
          limited = true;
          complete({captions: [], outcome: 'rate-limited'});
          await response.body?.cancel();
          return;
        }
        if (!response.ok ||
            Number(response.headers.get('content-length')) > maxBytes) {
          await response.body?.cancel();
          throw Error();
        }
        // Enforce the decoded-byte limit even on chunked/compressed responses.
        const reader = response.body?.getReader();
        if (!reader) throw Error();
        const decoder = new TextDecoder();
        let size = 0;
        let body = '';
        try {
          while (true) {
            const {done, value} = await reader.read();
            controller.signal.throwIfAborted();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw Error();
            body += decoder.decode(value, {stream: true});
          }
          body += decoder.decode();
        } finally {
          await reader.cancel();
        }
        if (new URL(root.location.href).searchParams.get('v') !== videoId ||
            navigating) throw Error();
        const captions = parseTranscriptPanel(JSON.parse(body), videoId);
        complete({captions, outcome: captions.length ? 'success' :
          'unavailable'});
      } catch {
        // Never reflect transport errors, page context, or raw response data.
        complete(unavailable);
      }
    })();
  });
  return {rateLimit};
}
