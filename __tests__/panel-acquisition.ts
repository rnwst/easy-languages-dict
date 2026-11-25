import {fetchCaptions} from '../content/lib/captions.js';

const track: YTCaptionTrack = {
  baseUrl: 'https://www.youtube.com/api/timedtext?v=fixture&lang=pl',
  languageCode: 'pl', vssId: '.pl', name: {simpleText: 'Polish'},
  isTranslatable: true,
};
const english = {...track, languageCode: 'en', vssId: '.en',
  baseUrl: track.baseUrl.replace('lang=pl', 'lang=en')};
const cues = [{start: 0, end: 2, text: 'Polski'}];
const body = JSON.stringify({events: [{tStartMs: 0, dDurationMs: 2000,
  segs: [{utf8: 'Native'}]}]});
const native = {id: 1, params: {v: 'fixture', lang: 'pl'}, headers: {},
  startedAt: 0, status: 200, body, outcome: 'load'};
function message(type: string, content: unknown) {
  window.dispatchEvent(new MessageEvent('message', {source: window,
    origin: location.origin,
    data: {origin: 'EASY_LANGUAGES_DICT_EXT', type, content}}));
}

describe('alternate caption acquisition', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function setup(options: {native?: boolean; replayStatus?: number;
    replayBody?: string; englishPanel?: boolean} = {}) {
    const panels: string[] = [];
    const post = jest.spyOn(window, 'postMessage').mockImplementation(msg => {
      if (msg.type === 'CAPTION_STATE_REQUEST' && options.native) {
        message('CAPTION_RESPONSE', native);
      }
      if (msg.type === 'CAPTION_REPLAY_REQUEST') {
        message('CAPTION_REPLAY_RESPONSE', {
          operationId: msg.content.operationId,
          status: options.replayStatus ?? 200,
          body: options.replayBody ?? body,
        });
      }
      if (msg.type === 'TRANSCRIPT_PANEL_REQUEST') {
        panels.push(msg.content.vssId);
        const success = msg.content.vssId !== '.en' || options.englishPanel;
        message('TRANSCRIPT_PANEL_RESPONSE', {...msg.content,
          outcome: success ? 'success' : 'unavailable',
          captions: success ? cues : []});
      }
    });
    return {panels, post};
  }

  it('keeps native success on the fast path', async () => {
    const f = setup({native: true});
    const result = await fetchCaptions(track,
      new AbortController().signal, english);
    await jest.advanceTimersByTimeAsync(1000);
    expect(result.captions[0].text).toBe('Native');
    expect((await result.translatedCaptions)[0].text).toBe('Native');
    expect(f.panels).toEqual([]);
  });

  it('falls back after startup timeout and keeps source on English failure',
    async () => {
      const f = setup();
      const pending = fetchCaptions(track,
        new AbortController().signal, english);
      await jest.advanceTimersByTimeAsync(25000);
      const result = await pending;
      expect(result.captions).toEqual(cues);
      expect(await result.translatedCaptions).toEqual([]);
      expect(f.panels).toEqual(['.pl', '.en']);
      expect(jest.getTimerCount()).toBe(0);
    });

  it('uses the panel for English independently after native English is empty',
    async () => {
      const f = setup({native: true, replayBody: '', englishPanel: true});
      const result = await fetchCaptions(track,
        new AbortController().signal, english);
      await jest.advanceTimersByTimeAsync(1000);
      expect(await result.translatedCaptions).toEqual(cues);
      expect(result.captions[0].text).toBe('Native');
      expect(f.panels).toEqual(['.en']);
    });

  it('does not fall back after native English rate limiting', async () => {
    const f = setup({native: true, replayStatus: 429});
    const result = await fetchCaptions(track,
      new AbortController().signal, english);
    const failure = expect(result.translatedCaptions).rejects.toMatchObject({
      status: 429,
    });
    await jest.advanceTimersByTimeAsync(1000);
    await failure;
    expect(result.captions[0].text).toBe('Native');
    expect(f.panels).toEqual([]);
  });

  it('does not fall back after native source rate limiting', async () => {
    const f = setup();
    const pending = fetchCaptions(track, new AbortController().signal);
    const failure = expect(pending).rejects.toMatchObject({status: 429});
    message('CAPTION_RESPONSE', {...native, status: 429, body: ''});
    await jest.advanceTimersByTimeAsync(200);
    await failure;
    expect(f.panels).toEqual([]);
  });

  it('preserves a cached 429 alongside source success without English fallback',
    async () => {
      const f = setup();
      const pending = fetchCaptions(track,
        new AbortController().signal, english);
      message('CAPTION_RESPONSE', native);
      message('CAPTION_RESPONSE', {...native, id: 2, status: 429, body: '',
        params: {v: 'fixture', lang: 'en'}});
      await jest.advanceTimersByTimeAsync(200);
      const result = await pending;
      expect(result.captions[0].text).toBe('Native');
      await expect(result.translatedCaptions).rejects.toMatchObject({
        status: 429,
      });
      expect(f.panels).toEqual([]);
    });

  it('keeps native English when source needs a panel', async () => {
    const f = setup({replayBody: ''});
    const pending = fetchCaptions(track, new AbortController().signal, english);
    message('CAPTION_RESPONSE', {...native,
      params: {v: 'fixture', lang: 'en'}});
    await jest.advanceTimersByTimeAsync(25000);
    const result = await pending;
    expect(result.captions).toEqual(cues);
    expect((await result.translatedCaptions)[0].text).toBe('Native');
    expect(f.panels).toEqual(['.pl']);
  });

  it('does not treat navigation cancellation as native failure', async () => {
    const f = setup();
    const controller = new AbortController();
    const pending = fetchCaptions(track, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
    expect(f.panels).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('discards panel responses after caller cancellation', async () => {
    const f = setup();
    let request: Record<string, unknown> | undefined;
    f.post.mockImplementation(msg => {
      if (msg.type === 'TRANSCRIPT_PANEL_REQUEST') request = msg.content;
    });
    const controller = new AbortController();
    const pending = fetchCaptions(track, controller.signal);
    const failure = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await jest.advanceTimersByTimeAsync(25000);
    expect(request).toBeDefined();
    controller.abort();
    message('TRANSCRIPT_PANEL_RESPONSE', {...request,
      outcome: 'success', captions: cues});
    await failure;
    expect(f.post).toHaveBeenCalledWith(expect.objectContaining({
      type: 'TRANSCRIPT_PANEL_CANCEL',
    }), location.origin);
    expect(jest.getTimerCount()).toBe(0);
  });
});
