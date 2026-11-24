import {createCaptionURL, fetchCaptions} from '../content/lib/captions.js';
import {getVideoMetadata} from '../content/lib/metadata.js';

const body = JSON.stringify({events: [{
  tStartMs: 0, dDurationMs: 2000, segs: [{utf8: 'Hallo'}],
}]});
const track: YTCaptionTrack = {
  baseUrl: 'https://www.youtube.com/api/timedtext?v=fixture&lang=de' +
    '&ei=old&signature=old&expire=old&sparams=v,ei,expire',
  languageCode: 'de', name: {simpleText: 'German'}, isTranslatable: false,
};

function message(type: string, content: unknown) {
  window.dispatchEvent(new MessageEvent('message', {
    source: window, origin: location.origin,
    data: {origin: 'EASY_LANGUAGES_DICT_EXT', type, content},
  }));
}

describe('caption startup races', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('preserves fresh signed parameters when selecting another track', () => {
    const url = createCaptionURL(track, {
      v: 'fixture', lang: 'en', ei: 'new', signature: 'new', expire: 'new',
      sparams: 'v,ei,expire', pot: 'fresh', tlang: 'fr',
    });
    expect(Object.fromEntries(url.searchParams)).toEqual({
      v: 'fixture', lang: 'de', ei: 'new', signature: 'new', expire: 'new',
      sparams: 'v,ei,expire', pot: 'fresh', fmt: 'json3',
    });
  });

  it('uses a cached successful native response even without a pot token',
    async () => {
      const fetch = jest.spyOn(global, 'fetch');
      jest.spyOn(window, 'postMessage').mockImplementation(() => {
        message('CAPTION_RESPONSE', {
          id: 1, headers: {}, startedAt: Date.now(), outcome: 'load',
          params: {v: 'fixture', lang: 'de'}, status: 200, body,
        });
      });
      const result = await fetchCaptions(track, new AbortController().signal);
      expect(result.captions).toEqual([{start: 0, end: 2, text: 'Hallo'}]);
      expect(fetch).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

  it('waits for a slow native response without cancelling or duplicating it',
    async () => {
      const fetch = jest.spyOn(global, 'fetch');
      jest.spyOn(window, 'postMessage').mockImplementation(() => {});
      const button = document.createElement('button');
      button.className = 'ytp-subtitles-button';
      button.setAttribute('aria-pressed', 'false');
      document.body.append(button);
      const states: boolean[] = [];
      button.onclick = () => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        states.push(on);
        if (on) {
          const params = {v: 'fixture', lang: 'de', pot: 'token'};
          const request = {id: 1, params, headers: {}, startedAt: Date.now()};
          message('CAPTION_REQUEST', request);
          setTimeout(() => message('CAPTION_RESPONSE', {
            ...request, status: 200, body, outcome: 'load',
          }), 5000);
        }
      };
      const pending = fetchCaptions(track, new AbortController().signal);
      await jest.advanceTimersByTimeAsync(4500);
      expect(states).toEqual([true]);
      expect(fetch).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(2500);
      expect((await pending).captions).toHaveLength(1);
      expect(states).toEqual([true, false]);
      expect(fetch).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

  it('recovers when the initial metadata is not ready on the first request',
    async () => {
      let requests = 0;
      jest.spyOn(window, 'postMessage').mockImplementation(() => {
        if (++requests === 3) {
          message('VIDEO_METADATA', {videoDetails: {videoId: 'late'}});
        }
      });
      const pending = getVideoMetadata('late', new AbortController().signal);
      await jest.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toMatchObject({
        videoDetails: {videoId: 'late'},
      });
      expect(jest.getTimerCount()).toBe(0);
    });

  it('waits for fresh context instead of replaying an empty tokenless URL',
    async () => {
      const fetch = jest.spyOn(global, 'fetch');
      jest.spyOn(window, 'postMessage').mockImplementation(() => {});
      const button = document.createElement('button');
      button.className = 'ytp-subtitles-button';
      button.setAttribute('aria-pressed', 'false');
      document.body.append(button);
      let requests = 0;
      button.onclick = () => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        if (!on) return;
        const request = {id: ++requests, startedAt: Date.now(), headers: {},
          params: {v: 'fixture', lang: 'de',
            ...(requests > 1 ? {pot: 'ready'} : {})}};
        message('CAPTION_REQUEST', request);
        message('CAPTION_RESPONSE', {...request, status: 200, outcome: 'load',
          body: requests > 1 ? body : ''});
      };
      const pending = fetchCaptions(track, new AbortController().signal);
      await jest.advanceTimersByTimeAsync(2200);
      expect(fetch).not.toHaveBeenCalled();
      expect(requests).toBe(1);
      await jest.advanceTimersByTimeAsync(2200);
      expect((await pending).captions).toHaveLength(1);
      expect(requests).toBe(2);
      expect(fetch).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

  it('protects signed translation parameters', () => {
    expect(() => createCaptionURL(track, {
      v: 'fixture', lang: 'de', tlang: 'fr', sparams: 'v,tlang',
    }, 'en')).toThrow('Cannot change signed caption parameter: tlang');
  });

  it('does not count a cached empty response twice or resurrect its start',
    async () => {
      const button = document.createElement('button');
      button.className = 'ytp-subtitles-button';
      button.setAttribute('aria-pressed', 'true');
      document.body.append(button);
      const request = {id: 1, params: {v: 'fixture', lang: 'de'},
        headers: {}, startedAt: Date.now()};
      const empty = {...request, status: 200, body: '', outcome: 'load'};
      jest.spyOn(window, 'postMessage').mockImplementation(() => {
        message('CAPTION_RESPONSE', empty);
        message('CAPTION_RESPONSE', empty);
        message('CAPTION_REQUEST', request);
      });
      const states: boolean[] = [];
      button.onclick = () => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        states.push(on);
        if (on) message('CAPTION_RESPONSE', {...request, id: 2,
          params: {...request.params, pot: 'ready'}, status: 200,
          body, outcome: 'load'});
      };
      const pending = fetchCaptions(track, new AbortController().signal);
      // Handle failures before moving the test clock forward, so a broken
      // implementation gives an assertion failure, not an unhandled rejection.
      const result = pending.then(value => value, error => error);
      await jest.advanceTimersByTimeAsync(26000);
      expect((await result).captions).toHaveLength(1);
      expect(states).toEqual([false, true]);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(jest.getTimerCount()).toBe(0);
    });

  it('uses the native request handle for a different caption track',
    async () => {
      const headers = {'x-youtube-client-name': '1',
        'x-youtube-client-version': 'fixture-version'};
      const fetch = jest.spyOn(global, 'fetch');
      const post = jest.spyOn(window, 'postMessage');
      post.mockImplementation((msg) => {
        if (msg.type === 'CAPTION_STATE_REQUEST') {
          message('CAPTION_RESPONSE', {
            id: 1, headers, startedAt: Date.now(), outcome: 'load',
            params: {v: 'fixture', lang: 'en', pot: 'ready'}, status: 200, body,
          });
        } else if (msg.type === 'CAPTION_REPLAY_REQUEST') {
          message('CAPTION_REPLAY_RESPONSE', {
            operationId: msg.content.operationId, status: 200, body,
          });
        }
      });
      const result = await fetchCaptions(track, new AbortController().signal);
      expect(result.captions).toHaveLength(1);
      expect(fetch).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledWith({
        origin: 'EASY_LANGUAGES_DICT_EXT', type: 'CAPTION_REPLAY_REQUEST',
        content: {operationId: expect.any(String), requestId: 1,
          selection: {lang: 'de', kind: null, name: null, tlang: null,
            fmt: 'json3'}},
      }, location.origin);
    });

  it('uses a newer successful native handle for deferred English captions',
    async () => {
      const response = (id: number): CaptionResponse => ({
        id, headers: {}, startedAt: Date.now(), outcome: 'load',
        params: {v: 'fixture', lang: 'de', pot: String(id)}, status: 200, body,
      });
      const handles: number[] = [];
      jest.spyOn(window, 'postMessage').mockImplementation((msg) => {
        if (msg.type === 'CAPTION_STATE_REQUEST') {
          message('CAPTION_RESPONSE', response(1));
        } else if (msg.type === 'CAPTION_REPLAY_REQUEST') {
          handles.push(msg.content.requestId);
          message('CAPTION_REPLAY_RESPONSE', {
            operationId: msg.content.operationId, status: 200, body,
          });
        }
      });
      const result = await fetchCaptions({...track, isTranslatable: true},
        new AbortController().signal);
      message('CAPTION_RESPONSE', response(2));
      await jest.advanceTimersByTimeAsync(1000);
      await expect(result.translatedCaptions).resolves.toHaveLength(1);
      expect(handles).toEqual([2]);
      expect(jest.getTimerCount()).toBe(0);
    });
});
