import {setTimeout as delay} from 'node:timers/promises';

export class Unverified extends Error {}
export class Incompatible extends Error {}
export class KnownLimitation extends Error {}

export function navigationFailure(error) {
  const code = String(error?.message).match(
    /net::ERR_[A-Z_0-9]+|NS_ERROR_[A-Z_0-9]+/)?.[0];
  return new Unverified(code ? `navigation-failed:${code}` :
    error?.name === 'TimeoutError' ?
      'navigation-timeout' : 'navigation-failed');
}

export function liveVideos(value = process.env.YT_LIVE_VIDEOS) {
  const entries = (value ?? 'Z9PRhksKFqU:pl').split(',');
  return entries.map(entry => {
    const [videoId, language, extra] = entry.trim().split(':');
    if (extra || !/^[\w-]{11}$/.test(videoId ?? '') ||
        !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(language ?? '') ||
        language.split('-')[0] === 'en') {
      throw new Error('YT_LIVE_VIDEOS must list VIDEO_ID:LANGUAGE pairs ' +
        'for non-English videos, separated by commas');
    }
    return {videoId, language};
  });
}

/** Bounded observation, not network retries. */
export async function until(predicate, milliseconds = 30000) {
  const deadline = Date.now() + milliseconds;
  do {
    const value = await predicate();
    if (value) return value;
    await delay(200);
  } while (Date.now() < deadline);
}

/** Navigation can start another ad break. Give caption acquisition its full
 * content-time budget, while bounding the total time spent waiting for ads.
 */
export async function untilContent(page, predicate) {
  let contentTime = 0;
  let adTime = 0;
  let last = Date.now();
  let wasAd = false;
  while (contentTime < 45000 && adTime < 60000) {
    const ad = await page.evaluate(() => Boolean(document.querySelector(
      '#movie_player.ad-showing, #movie_player.ad-interrupting')));
    const now = Date.now();
    if (wasAd) adTime += now - last;
    else contentTime += now - last;
    last = now;
    wasAd = ad;
    if (ad) {
      const buttons = await page.$$(
        'button.ytp-skip-ad-button, button.ytp-ad-skip-button');
      try {
        for (const button of buttons) {
          if (await button.evaluate(element => !element.disabled &&
              element.checkVisibility({visibilityProperty: true}))) {
            await button.click();
            break;
          }
        }
      } finally {
        await Promise.all(buttons.map(button => button.dispose()));
      }
    } else {
      const value = await predicate();
      if (value) return value;
    }
    await delay(200);
  }
  if (adTime >= 60000) throw new Unverified('ad-did-not-finish');
}

export function responseJSON(response) {
  if (!response) throw new Unverified('response-not-observed');
  if (response.status === 429) throw new Unverified('rate-limited');
  if (response.status !== 200) {
    throw new Unverified(`response-http-${response.status}`);
  }
  if (response.unreadable) throw new Unverified('response-body-unreadable');
  if (!response.body?.trim()) throw new Unverified('empty-response');
  try { return JSON.parse(response.body); } catch {
    // A nonempty successful response with a new format is contract drift.
    throw new Incompatible('Successful response is not supported JSON');
  }
}

/** Empty HTTP 200 bodies are a documented native-caption failure mode.
 * Keep this distinct from validating a successful caption payload, and from
 * unavailable transport or rate limiting. Fallback/rendering are still tested.
 */
export function nativeCaptionResponses(responses) {
  const usable = responses.filter(response => response.status === 200 &&
    !response.unreadable && response.body?.trim());
  if (usable.length) return usable;
  if (responses.length && responses.every(response =>
    response.complete && response.status === 200 &&
      !response.unreadable && response.body === '')) {
    throw new KnownLimitation('empty-native-captions');
  }
  responseJSON(responses.find(response => response.status === 429) ??
    responses.at(-1));
  throw new Unverified('native-captions-unavailable');
}

export function overallOutcome(report, expectedChecks) {
  const checks = report.videos.flatMap(video => video.checks);
  if (checks.some(check => check.outcome === 'incompatible')) {
    return 'incompatible';
  }
  const incomplete = checks.some(check =>
    !['pass', 'known-limitation'].includes(check.outcome));
  if (report.setup !== 'pass' || checks.length !== expectedChecks ||
      incomplete) {
    return 'unverified';
  }
  return checks.some(check => check.outcome === 'known-limitation') ?
    'pass-with-known-limitations' : 'pass';
}

function consentVisible() {
  const dialog = document.querySelector('ytd-consent-bump-v2-lightbox');
  // YouTube retains the outer custom element after closing its inner dialog.
  // Its own checkVisibility() can therefore stay true after consent is saved.
  return location.hostname.startsWith('consent.') ||
    [...(dialog?.querySelectorAll('button') ?? [])].some(button =>
      button.checkVisibility({visibilityProperty: true,
        opacityProperty: true}));
}

/** Guest profiles can receive a consent page or a late-loading lightbox. */
export async function rejectConsent(page) {
  if (!await page.evaluate(consentVisible)) return false;
  const handle = await page.evaluateHandle(() => {
    const root = location.hostname.startsWith('consent.') ? document :
      document.querySelector('ytd-consent-bump-v2-lightbox');
    return [...(root?.querySelectorAll('button') ?? [])].find(button =>
      button.checkVisibility({visibilityProperty: true,
        opacityProperty: true}) &&
        button.textContent?.trim() === 'Reject all');
  });
  try {
    const button = handle.asElement();
    if (!button) throw new Unverified('consent-required');
    await button.click();
    const cleared = await until(async () => {
      try { return !await page.evaluate(consentVisible); } catch {
        // A dedicated consent page can navigate back to the watch page.
        return false;
      }
    }, 15000);
    if (!cleared) throw new Unverified('consent-required');
  } finally {
    await handle.dispose();
  }
  return true;
}

export async function clickControl(page, selector, {keyboard = false} = {}) {
  const ready = await until(async () => {
    await rejectConsent(page);
    return page.$eval(selector, element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2,
        rect.y + rect.height / 2);
      return rect.width > 0 && rect.height > 0 && element.contains(hit);
    });
  }, 10000);
  if (!ready) throw new Unverified('control-obscured');
  if (keyboard) {
    await page.focus(selector);
    if (!await page.$eval(selector, element =>
      document.activeElement === element)) {
      throw new Unverified('control-not-focused');
    }
    await page.keyboard.press('Enter');
  } else await page.click(selector);
}

export async function clickNativeCC(page) {
  await page.evaluate(() => {
    window.__eldLive.ccStates = [];
    window.__eldLive.ccInputs = 0;
    window.__eldLive.ccBefore = null;
  });
  // Keyboard activation avoids moving/fading player-control hit targets while
  // still using genuine trusted input, unlike element.click() in JavaScript.
  await clickControl(page, '#movie_player .ytp-subtitles-button',
    {keyboard: true});
  const changed = await until(() => page.evaluate(() => {
    const state = window.__eldLive;
    if (!['true', 'false'].includes(state.ccBefore)) return false;
    const expected = state.ccBefore === 'true' ? 'false' : 'true';
    const current = document.querySelector('.ytp-subtitles-button')
      ?.getAttribute('aria-pressed');
    return state.ccInputs > 0 &&
      (state.ccStates.includes(expected) || current === expected);
  }), 10000);
  if (!changed) {
    throw new Incompatible('A trusted CC click must change caption state');
  }
}

/** Install observers only: no response substitution or page API stubs. */
export async function observePage(page) {
  const responses = [];
  const pending = new Set();
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.hostname !== 'www.youtube.com') return;
    const kind = url.pathname === '/api/timedtext' ? 'native' :
      url.pathname === '/youtubei/v1/get_panel' ? 'panel' : undefined;
    if (!kind || responses.length >= 100) return;
    const entry = {kind, status: response.status(),
      videoId: url.searchParams.get('v'), lang: url.searchParams.get('lang'),
      translated: Boolean(url.searchParams.get('tlang')), bytes: 0};
    responses.push(entry);
    const task = (async () => {
      try {
        if (kind === 'panel') {
          const body = await response.request().fetchPostData();
          entry.params = JSON.parse(body).params;
        }
        if (Number(response.headers()['content-length']) > 4 * 1024 * 1024) {
          throw new Error('Oversized response');
        }
        entry.body = await response.text();
        entry.bytes = Buffer.byteLength(entry.body);
        if (entry.bytes > 4 * 1024 * 1024) throw Error('Oversized response');
      } catch {
        entry.unreadable = true;
        delete entry.body;
      } finally {
        entry.complete = true;
      }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  await page.evaluateOnNewDocument(() => {
    window.__eldLive = {metadata: [], native: [], panel: [], messages: {},
      ccStates: [], ccInputs: 0,
      start: 0, finish: 0};
    const ccObserver = new MutationObserver(records => {
      for (const {target, oldValue} of records) {
        if (target.matches?.('#movie_player .ytp-subtitles-button')) {
          const states = window.__eldLive.ccStates;
          if (states.length < 100) {
            // Several transitions can arrive in one observer batch. The old
            // value preserves a brief enabled state already reset by YouTube.
            states.push(oldValue);
            states.push(target.getAttribute('aria-pressed'));
          }
        }
      }
    });
    ccObserver.observe(document, {subtree: true, attributes: true,
      attributeFilter: ['aria-pressed'], attributeOldValue: true});
    const ccInput = event => {
      if (event.type === 'keydown' &&
          !['Enter', 'Space'].includes(event.code)) return;
      if (event.isTrusted && event.target instanceof Element &&
          event.target.closest('#movie_player .ytp-subtitles-button')) {
        // Read the state at the actual click, not before a consent dialog or
        // asynchronous player update. Ignore older queued attribute changes.
        ccObserver.takeRecords();
        window.__eldLive.ccStates = [];
        window.__eldLive.ccBefore = event.target.closest(
          '#movie_player .ytp-subtitles-button').getAttribute('aria-pressed');
        window.__eldLive.ccInputs++;
      }
    };
    document.addEventListener('click', ccInput, {capture: true});
    document.addEventListener('keydown', ccInput, {capture: true});
    document.addEventListener('yt-navigate-start', () =>
      window.__eldLive.start++);
    document.addEventListener('yt-navigate-finish', () =>
      window.__eldLive.finish++);
    window.addEventListener('message', event => {
      if (event.source !== window || event.origin !== location.origin ||
          event.data?.origin !== 'EASY_LANGUAGES_DICT_EXT') return;
      const {type, content} = event.data;
      const state = window.__eldLive;
      // Only known message names go into diagnostic output.
      if (['VIDEO_METADATA', 'CAPTION_REQUEST', 'CAPTION_RESPONSE',
        'TRANSCRIPT_PANEL_RESPONSE'].includes(type)) {
        state.messages[type] = (state.messages[type] ?? 0) + 1;
      }
      if (type === 'VIDEO_METADATA' && state.metadata.length < 100) {
        state.metadata.push(content);
      }
      if (type === 'CAPTION_RESPONSE' && state.native.length < 100) {
        state.native.push({videoId: content?.params?.v,
          status: content?.status, outcome: content?.outcome});
      }
      if (type === 'TRANSCRIPT_PANEL_RESPONSE' && state.panel.length < 100) {
        state.panel.push({operationId: content?.operationId,
          outcome: content?.outcome});
      }
    });
  });
  return {responses, summary: () => responses.map(entry => ({
    kind: entry.kind, status: entry.status, bytes: entry.bytes,
    complete: Boolean(entry.complete), unreadable: Boolean(entry.unreadable),
  })), close: async () => {
    if (!page.isClosed()) await page.close();
    await Promise.allSettled([...pending]);
  }};
}

/** Runs in the real page; return only the metadata used by the extension. */
export function pageMetadata(videoId) {
  const player = document.querySelector('#movie_player');
  let response;
  try { response = player?.getPlayerResponse?.(); } catch { /* Not ready. */ }
  const candidates = [response, window.ytInitialPlayerResponse]
    .filter(value => value?.videoDetails?.videoId === videoId);
  response = candidates.find(value => value.captions) ?? candidates[0];
  if (!response) return;
  return {videoDetails: {videoId: response.videoDetails.videoId},
    captions: response.captions};
}

export async function availability(page) {
  await rejectConsent(page);
  if (await page.evaluate(consentVisible)) {
    throw new Unverified('consent-required');
  }
  const state = await page.evaluate(() => {
    let response = window.ytInitialPlayerResponse;
    try {
      const player = document.querySelector('#movie_player');
      response = player?.getPlayerResponse?.() ?? response;
    } catch { /* Use initial response. */ }
    const status = response?.playabilityStatus?.status;
    return {
      challenge: location.pathname.startsWith('/sorry') || Boolean(
        document.querySelector('#captcha, iframe[src*="recaptcha"]')),
      status: typeof status === 'string' ? status : null,
    };
  });
  if (state.challenge) throw new Unverified('bot-challenge');
  if (state.status && state.status !== 'OK') {
    throw new Unverified('video-not-playable');
  }
}

/** Omit URLs, bodies, headers, titles, and arbitrary automation errors. */
export function failure(error) {
  if (error instanceof Unverified) {
    return {outcome: 'unverified', reason: error.message};
  }
  if (error?.name === 'AssertionError' || error instanceof Incompatible) {
    return {outcome: 'incompatible', reason: error.message};
  }
  return {outcome: 'unverified', reason: 'automation-failed'};
}
