/**
 * The browser separates the page's JavaScript from the extension's JavaScript.
 * This script runs on the page's side so it can read YouTube's player and watch
 * its requests. It passes the needed data to the extension's separate script,
 * which decides what captions to show and draws the interface.
 */
import {installAwaitCaptionDecoration} from './lib/awaitCaptionDecoration.js';
import {installCaptionReplay} from './lib/captionReplay.js';
import {installTranscriptPanel} from './lib/transcriptPanelBridge.js';

declare global {
  interface Window {
    ytInitialPlayerResponse?: YTVideoMetadata;
    ytcfg?: {get: (key: string) => unknown};
    ytInitialData?: unknown;
  }
}

(() => {
  const origin = 'EASY_LANGUAGES_DICT_EXT';
  const activeRequests = new Map<string, CaptionRequest>();
  const captionResponses = new Map<string, CaptionResponse>();
  let requestId = 0;
  const metadataResponses = new Map<string, YTVideoMetadata>();
  const remember = <T>(cache: Map<string, T>, id: string, value: T) => {
    cache.delete(id);
    cache.set(id, value);
    if (cache.size > 10) cache.delete(cache.keys().next().value!);
  };
  const send = (type: string, content: unknown) => {
    window.postMessage({origin, type, content}, location.origin);
  };
  installAwaitCaptionDecoration((status) => {
    send('CAPTION_DECORATION_STATUS', status);
  });
  const panel = installTranscriptPanel({
    metadata: currentMetadata,
    context: () => window.ytcfg?.get('INNERTUBE_CONTEXT'),
    initialData: () => window.ytInitialData,
  });
  const replay = installCaptionReplay({onRateLimit: panel.rateLimit});
  const describeRequest = (
    address: string, method: string, headers: Headers,
  ) => {
    try {
      const url = new URL(address, location.origin);
      if (method.toUpperCase() === 'GET' &&
          url.pathname === '/api/timedtext' && url.searchParams.has('v')) {
        const clientHeaders: Record<string, string> = {};
        const keys = ['x-youtube-client-name', 'x-youtube-client-version'];
        for (const key of keys) {
          const value = headers.get(key);
          if (value) clientHeaders[key] = value;
        }
        const request: CaptionRequest = {
          id: ++requestId, params: Object.fromEntries(url.searchParams),
          headers: clientHeaders, startedAt: Date.now(),
        };
        return request;
      }
    } catch { /* Leave malformed requests to the native implementation. */ }
  };
  const started = (request: CaptionRequest, url: string, headers: Headers) => {
    replay.remember(request.id, url, headers);
    activeRequests.set(String(request.id), request);
    send('CAPTION_REQUEST', request);
  };
  // Pass along the text YouTube downloaded. The other script checks and parses
  // it, so we can use the same captions instead of downloading them again.
  const captionResponse = (
    request: CaptionRequest, status: number, body: string,
    outcome: CaptionResponse['outcome'] = 'load',
  ) => {
    const content = {...request, status, body, outcome};
    if (status === 429) panel.rateLimit(request.params.v);
    activeRequests.delete(String(request.id));
    // Save failures too. A script asking for earlier results needs to know
    // which requests have finished, rather than keep waiting for them.
    remember(captionResponses, String(request.id), content);
    send('CAPTION_RESPONSE', content);
  };
  // Copy the fields we use, rather than all of YouTube's video/stream details.
  const metadata = (value: YTVideoMetadata | undefined) => value && ({
    videoDetails: value.videoDetails,
    captions: value.captions,
    streamingData: {
      adaptiveFormats: value.streamingData?.adaptiveFormats?.map(
        ({audioTrack}) => ({audioTrack})
      ) ?? [],
    },
  });
  function currentMetadata(id: string): YTVideoMetadata | undefined {
    let current: YTVideoMetadata | undefined;
    try {
      const player = document.getElementById('movie_player') as
        (HTMLElement & {getPlayerResponse?: () => YTVideoMetadata}) | null;
      current = player?.getPlayerResponse?.();
    } catch { /* Player initialization may still be in progress. */ }
    const candidates = [current, metadataResponses.get(id),
      window.ytInitialPlayerResponse]
      .filter(value => value?.videoDetails?.videoId === id);
    return candidates.find(value => value?.captions) ?? candidates[0];
  }
  window.addEventListener('message', (evt) => {
    if (evt.source !== window || evt.origin !== location.origin ||
        evt.data?.origin !== origin) return;
    if (evt.data.type === 'VIDEO_METADATA_REQUEST') {
      const id = evt.data.videoId;
      // When switching videos, YouTube may update the player without setting
      // ytInitialPlayerResponse or making a request we observed. Ask the player
      // itself for the video information as another way to obtain it.
      const value = metadata(currentMetadata(id));
      if (value) send('VIDEO_METADATA', value);
    } else if (evt.data.type === 'CAPTION_STATE_REQUEST') {
      for (const request of activeRequests.values()) {
        if (request.params.v === evt.data.videoId) {
          send('CAPTION_REQUEST', request);
        }
      }
      const responses = [...captionResponses.values()]
        .sort((a, b) => a.id - b.id);
      for (const response of responses) {
        if (response.params.v === evt.data.videoId) {
          send('CAPTION_RESPONSE', response);
        }
      }
    }
  });

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const response = originalFetch.call(this, input, init);
    let url = '';
    let request: CaptionRequest | undefined;
    let headers = new Headers();
    try {
      url = input instanceof Request ? input.url : String(input);
      if (url.includes('/api/timedtext')) {
        headers = new Headers(init?.headers ??
          (input instanceof Request ? input.headers : undefined));
        request = describeRequest(url,
          init?.method ?? (input instanceof Request ? input.method : 'GET'),
          headers);
      }
    } catch { /* Observation must not change native fetch rejection. */ }
    if (request) {
      const captured = request;
      started(captured, url, headers);
      void response.then(async (result) => {
        captionResponse(captured, result.status, await result.clone().text());
      }).catch((error) => captionResponse(captured, 0, '',
        error?.name === 'AbortError' ? 'abort' : 'error'));
    }
    if (url.includes('/youtubei/v1/player')) {
      void response.then(async (result) => {
        if (result.ok) {
          const value = metadata(await result.clone().json());
          if (value?.videoDetails?.videoId) {
            remember(metadataResponses, value.videoDetails.videoId, value);
            send('VIDEO_METADATA', value);
          }
        }
      }).catch(() => {});
    }
    return response;
  };

  // Watch XMLHttpRequest (XHR) downloads while keeping normal browser events.
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const xhrPending = new WeakMap<XMLHttpRequest, () => void>();
  const xhrState = new WeakMap<XMLHttpRequest, {
    method: string; address: string; async: boolean; headers: Headers;
    sent: boolean;
  }>();
  XMLHttpRequest.prototype.open = function (
    method: string, address: string | URL, async: boolean = true,
    username?: string | null, password?: string | null,
  ) {
    // Calling open() again can end the old XHR request without an abort event.
    // Mark our old record as finished; do not manufacture browser events.
    // If open() fails, the old request may still be running. Keep watching it.
    const previous = xhrPending.get(this);
    originalOpen.call(this, method, address, async, username, password);
    previous?.();
    xhrState.set(this, {method, address: String(address), async,
      headers: new Headers(), sent: false});
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    originalSetHeader.call(this, name, value);
    xhrState.get(this)?.headers.append(name, value);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const state = xhrState.get(this);
    if (!state || !state.async || state.sent || this.readyState !== 1) {
      return originalSend.call(this, body);
    }
    const request = describeRequest(state.address, state.method, state.headers);
    if (!request) return originalSend.call(this, body);
    const events = ['load', 'error', 'abort', 'timeout'] as const;
    let published = false;
    let completed = false;
    const synchronousCompletions: Array<{
      status: number; text: string; outcome: CaptionResponse['outcome'];
    }> = [];
    const cleanup = () => {
      for (const type of events) this.removeEventListener(type, complete);
      if (xhrPending.get(this) === superseded) xhrPending.delete(this);
    };
    const finish = (completion: typeof synchronousCompletions[number]) => {
      if (completed) return;
      completed = true;
      cleanup();
      if (published) {
        captionResponse(request, completion.status, completion.text,
          completion.outcome);
      } else synchronousCompletions.push(completion);
    };
    const superseded = () => finish({status: 0, text: '', outcome: 'abort'});
    const complete = (evt: Event) => {
      let text = '';
      if (evt.type === 'load') {
        if (this.responseType === '' || this.responseType === 'text') {
          text = this.responseText;
        } else if (this.responseType === 'json') {
          text = JSON.stringify(this.response);
        }
      }
      finish({status: this.status, text,
        outcome: evt.type as CaptionResponse['outcome']});
    };
    xhrPending.set(this, superseded);
    for (const type of events) this.addEventListener(type, complete);
    try {
      originalSend.call(this, body);
      state.sent = true;
      started(request, state.address, state.headers);
      published = true;
      // YouTube's loadstart handler can cancel a request before send() returns.
      // Tell the other script about the start first, then the cancellation,
      // otherwise it could keep waiting for a request that has already ended.
      for (const completion of synchronousCompletions) {
        captionResponse(request, completion.status, completion.text,
          completion.outcome);
      }
    } catch (error) {
      cleanup();
      throw error;
    }
  };
})();

export {};
