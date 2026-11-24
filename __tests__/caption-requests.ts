import {fetchCaptionTrack} from '../content/lib/captions.js';
import {waitForMessage} from '../content/lib/messages.js';

describe('caption requests', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('awaits transport retries and returns a successful response', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(new Response(JSON.stringify({events: [{
        tStartMs: 0, dDurationMs: 1000, segs: [{utf8: 'Hallo'}],
      }]})));
    const pending = fetchCaptionTrack(new URL('https://example.com/captions'),
      new AbortController().signal);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual([
      {start: 0, end: 1, text: 'Hallo'},
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([200, 429])('does not replay an empty/rejected %i', async status => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValue(new Response('', {status}));
    await expect(fetchCaptionTrack(new URL('https://example.com/captions'),
      new AbortController().signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels a retry delay on navigation', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockRejectedValue(new Error('Offline'));
    const controller = new AbortController();
    const pending = fetchCaptionTrack(new URL('https://example.com/captions'),
      controller.signal);
    const assertion = expect(pending).rejects.toThrow('Navigation');
    await jest.advanceTimersByTimeAsync(1);
    controller.abort(new Error('Navigation'));
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('removes bridge listeners on timeout', async () => {
    const remove = jest.spyOn(window, 'removeEventListener');
    const pending = waitForMessage('TEST', new AbortController().signal,
      () => true, 100);
    const assertion = expect(pending).rejects.toThrow('Timed out');
    await jest.advanceTimersByTimeAsync(100);
    await assertion;
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
  });
});
