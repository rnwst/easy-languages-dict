import {fetchCaptions} from '../content/lib/captions.js';

const track: YTCaptionTrack = {
  baseUrl: 'https://www.youtube.com/api/timedtext?v=fixture&lang=pl',
  languageCode: 'pl', name: {simpleText: 'Polish'}, isTranslatable: true,
};
const body = (text: string) => JSON.stringify({events: [{
  tStartMs: 0, dDurationMs: 2000, segs: [{utf8: text}],
}]});
const response = (id: number, params: Record<string, string>, text: string):
  CaptionResponse => ({id, headers: {}, startedAt: Date.now(), outcome: 'load',
  params: {v: 'fixture', ...params}, status: 200, body: body(text)});

function message(type: string, content: unknown) {
  window.dispatchEvent(new MessageEvent('message', {
    source: window, origin: location.origin,
    data: {origin: 'EASY_LANGUAGES_DICT_EXT', type, content},
  }));
}

function setup(cached: CaptionResponse[]) {
  const replays: Array<{requestId: number;
    selection: Record<string, string | null>}> = [];
  const fetch = jest.spyOn(global, 'fetch');
  jest.spyOn(window, 'postMessage').mockImplementation(msg => {
    if (msg.type === 'CAPTION_STATE_REQUEST') {
      cached.forEach(value => message('CAPTION_RESPONSE', value));
    } else if (msg.type === 'CAPTION_REPLAY_REQUEST') {
      replays.push(msg.content);
      message('CAPTION_REPLAY_RESPONSE', {
        operationId: msg.content.operationId, status: 200,
        body: body(msg.content.selection.tlang ||
          /^en(?:-|$)/i.test(msg.content.selection.lang) ?
          'Replayed English' : 'Polski'),
      });
    }
  });
  return {replays, fetch};
}

describe('reuse native English captions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('retrieves an existing English track without tlang', async () => {
    const f = setup([response(1, {lang: 'pl'}, 'Polski')]);
    const englishTrack = {...track, languageCode: 'en-GB',
      baseUrl: track.baseUrl.replace('lang=pl', 'lang=en-GB')};
    const result = await fetchCaptions({...track, isTranslatable: false},
      new AbortController().signal, englishTrack);
    await jest.advanceTimersByTimeAsync(1000);
    expect((await result.translatedCaptions)[0].text).toBe('Replayed English');
    expect(f.replays).toHaveLength(1);
    expect(f.replays[0].selection).toMatchObject({lang: 'en-GB', tlang: null});
    expect(result.captions[0].text).toBe('Polski');
  });

  it('uses cached English before requesting an existing English track',
    async () => {
      const f = setup([response(1, {lang: 'en'}, 'Native English'),
        response(2, {lang: 'pl'}, 'Polski')]);
      const result = await fetchCaptions(track, new AbortController().signal,
        {...track, languageCode: 'en',
          baseUrl: track.baseUrl.replace('lang=pl', 'lang=en')});
      await jest.advanceTimersByTimeAsync(1000);
      expect((await result.translatedCaptions)[0].text).toBe('Native English');
      expect(f.replays).toEqual([]);
    });

  it.each<Record<string, string>>([
    {lang: 'en'}, {lang: 'en-GB'}, {lang: 'pl', tlang: 'en-US'},
  ])('uses cached English output %j without replay', async params => {
    const f = setup([response(1, params, 'Native English'),
      response(2, {lang: 'pl'}, 'Polski')]);
    const result = await fetchCaptions(track, new AbortController().signal);
    expect(result.captions[0].text).toBe('Polski');
    await jest.advanceTimersByTimeAsync(1000);
    expect((await result.translatedCaptions)[0].text).toBe('Native English');
    expect(f.replays).toEqual([]);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('fetches Polish from an English context but reuses its English body',
    async () => {
      const f = setup([response(1, {lang: 'en'}, 'Native English')]);
      const pending = fetchCaptions(track, new AbortController().signal);
      await jest.advanceTimersByTimeAsync(200);
      const result = await pending;
      expect(result.captions[0].text).toBe('Polski');
      await jest.advanceTimersByTimeAsync(1000);
      expect((await result.translatedCaptions)[0].text).toBe('Native English');
      expect(f.replays).toHaveLength(1);
      expect(f.replays[0].selection).toMatchObject({lang: 'pl', tlang: null});
      expect(f.fetch).not.toHaveBeenCalled();
    });

  it('uses the newest valid English response arriving during the delay',
    async () => {
      const f = setup([response(1, {lang: 'pl'}, 'Polski')]);
      const result = await fetchCaptions(track, new AbortController().signal);
      message('CAPTION_RESPONSE', response(2, {lang: 'en-GB'}, 'First'));
      message('CAPTION_RESPONSE', response(4,
        {lang: 'pl', tlang: 'en'}, 'Newest'));
      message('CAPTION_RESPONSE', response(3, {lang: 'en'}, 'Older'));
      message('CAPTION_RESPONSE', {...response(5, {lang: 'en'}, 'Invalid'),
        body: ''});
      message('CAPTION_RESPONSE', response(6,
        {v: 'other', lang: 'en'}, 'Other video'));
      await jest.advanceTimersByTimeAsync(1000);
      expect((await result.translatedCaptions)[0].text).toBe('Newest');
      expect(result.captions[0].text).toBe('Polski');
      expect(f.replays).toEqual([]);
      expect(jest.getTimerCount()).toBe(0);
    });

  it('does not mistake an English source translated into French for English',
    async () => {
      const f = setup([response(1, {lang: 'en', tlang: 'fr'}, 'Français'),
        response(2, {lang: 'pl'}, 'Polski')]);
      const result = await fetchCaptions(track, new AbortController().signal);
      message('CAPTION_RESPONSE', response(3,
        {lang: 'en-US', tlang: 'fr'}, 'Plus récent'));
      await jest.advanceTimersByTimeAsync(1000);
      const english = await result.translatedCaptions;
      expect(english[0].text).toBe('Replayed English');
      expect(f.replays).toHaveLength(1);
      expect(f.replays[0]).toMatchObject({requestId: 3,
        selection: {lang: 'pl', tlang: 'en'}});
      expect(result.captions[0].text).toBe('Polski');
    });

  it('can display cached English even after another native request is limited',
    async () => {
      const f = setup([
        response(1, {lang: 'pl'}, 'Polski'),
        response(2, {lang: 'en'}, 'Native English'),
        {...response(3, {lang: 'fr'}, ''), status: 429, body: ''},
      ]);
      const result = await fetchCaptions(track, new AbortController().signal);
      await jest.advanceTimersByTimeAsync(1000);
      expect((await result.translatedCaptions)[0].text).toBe('Native English');
      expect(f.replays).toEqual([]);
    });
});
