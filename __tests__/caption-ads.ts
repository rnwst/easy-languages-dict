import {fetchCaptions} from '../content/lib/captions.js';

const track: YTCaptionTrack = {
  baseUrl: 'https://www.youtube.com/api/timedtext?v=fixture&lang=de',
  languageCode: 'de', name: {simpleText: 'German'}, isTranslatable: false,
};
function message(type: string, content: unknown) {
  window.dispatchEvent(new MessageEvent('message', {
    source: window, origin: location.origin,
    data: {origin: 'EASY_LANGUAGES_DICT_EXT', type, content},
  }));
}
function player(ad = true) {
  const node = document.createElement('div');
  node.id = 'movie_player';
  if (ad) node.className = 'ad-showing';
  document.body.append(node);
  return node;
}

describe('caption acquisition during ads', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(window, 'postMessage').mockImplementation(() => {});
  });
  afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('waits beyond 25 seconds without CC clicks or consuming attempts',
    async () => {
      const node = player();
      const button = document.createElement('button');
      button.className = 'ytp-subtitles-button';
      button.setAttribute('aria-pressed', 'false');
      node.append(button);
      const click = jest.fn(() => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        if (on) message('CAPTION_RESPONSE', {
          id: 2, params: {v: 'fixture', lang: 'de'}, status: 200,
          outcome: 'load', headers: {}, startedAt: Date.now(),
          body: JSON.stringify({events: [{tStartMs: 0, dDurationMs: 2000,
            segs: [{utf8: 'Hallo'}]}]}),
        });
      });
      button.onclick = click;
      const pending = fetchCaptions(track, new AbortController().signal);
      const settled = jest.fn();
      void pending.then(settled, settled);
      message('CAPTION_RESPONSE', {id: 1, params: {v: 'advertisement'},
        status: 429, outcome: 'load', body: ''});
      await jest.advanceTimersByTimeAsync(45000);
      expect(settled).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      node.classList.remove('ad-showing');
      await jest.advanceTimersByTimeAsync(1000);
      expect((await pending).captions[0].text).toBe('Hallo');
      expect(click).toHaveBeenCalledTimes(2); // Acquire, restore initial off.
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(jest.getTimerCount()).toBe(0);
    });

  it('preserves the remaining deadline across a later ad break', async () => {
    const node = player(false);
    const pending = fetchCaptions(track, new AbortController().signal);
    const failed = jest.fn();
    void pending.catch(failed);
    await jest.advanceTimersByTimeAsync(10000);
    node.className = 'ad-showing';
    await jest.advanceTimersByTimeAsync(40000);
    expect(failed).not.toHaveBeenCalled();
    node.className = '';
    await jest.advanceTimersByTimeAsync(14900);
    expect(failed).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(200);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0][0].message).toContain('No usable native');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels navigation while waiting for an ad without later activity',
    async () => {
      const node = player();
      const controller = new AbortController();
      const pending = fetchCaptions(track, controller.signal);
      const assertion = expect(pending).rejects.toThrow('Navigation');
      controller.abort(new Error('Navigation'));
      await assertion;
      node.className = '';
      await jest.advanceTimersByTimeAsync(30000);
      expect(jest.getTimerCount()).toBe(0);
    });
});
