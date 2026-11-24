import {installCaptionReplay} from '../content/lib/captionReplay.js';

const marker = 'EASY_LANGUAGES_DICT_EXT';
const address = 'https://www.youtube.com/api/timedtext?v=video&lang=de' +
  '&signature=signed&pot=token&sparams=v,signature';

function fixture() {
  const target = new EventTarget();
  const postMessage = jest.fn();
  const nativeFetch = jest.fn<ReturnType<typeof fetch>,
    Parameters<typeof fetch>>();
  const root = Object.assign(target, {
    location: {origin: 'https://www.youtube.com',
      href: 'https://www.youtube.com/watch?v=video'},
    document: new EventTarget(), postMessage, fetch: nativeFetch,
  }) as unknown as Window;
  const replay = installCaptionReplay({root});
  const message = (type: string, content: unknown, overrides = {}) => {
    target.dispatchEvent(new MessageEvent('message', {
      source: root, origin: root.location.origin,
      data: {origin: marker, type, content}, ...overrides,
    }));
  };
  const request = (operationId = 'op', requestId = 1,
    selection: Record<string, string | null> = {tlang: 'en'}) => {
    message('CAPTION_REPLAY_REQUEST', {operationId, requestId, selection});
  };
  return {root, replay, nativeFetch, postMessage, message, request};
}

describe('private native caption replay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('replays private headers through the saved native fetch', async () => {
    const f = fixture();
    const headers = new Headers({Authorization: 'dummy-secret',
      'X-Goog-Visitor-Id': 'dummy-visitor', 'X-Goog-AuthUser': '0',
      'X-YouTube-Client-Name': '1', Cookie: 'forbidden', Host: 'forbidden',
      'Sec-Fetch-Site': 'forbidden'});
    f.replay.remember(1, address, headers);
    headers.set('Authorization', 'later-secret');
    f.root.fetch = jest.fn();
    f.nativeFetch.mockResolvedValue(new Response('captions', {status: 200,
      headers: {'X-Private': 'response-secret'}}));
    f.request();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.root.fetch).not.toHaveBeenCalled();
    const [url, options] = f.nativeFetch.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('tlang')).toBe('en');
    expect(options).toMatchObject({method: 'GET', credentials: 'include',
      redirect: 'error'});
    expect(Object.fromEntries(options!.headers as Headers)).toEqual({
      authorization: 'dummy-secret', 'x-goog-visitor-id': 'dummy-visitor',
      'x-goog-authuser': '0', 'x-youtube-client-name': '1',
    });
    expect(f.postMessage).toHaveBeenCalledWith({origin: marker,
      type: 'CAPTION_REPLAY_RESPONSE',
      content: {operationId: 'op', status: 200, body: 'captions'}},
    'https://www.youtube.com');
    expect(JSON.stringify(f.postMessage.mock.calls)).not.toMatch(
      /dummy-secret|dummy-visitor|later-secret|response-secret/);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    'https://other.example/api/timedtext?v=video',
    'https://www.youtube.com/other?v=video',
    'https://www.youtube.com/api/timedtext?v=other',
    'https://www.youtube.com/api/timedtext?v=video&v=other',
  ])('rejects unsupported native URL %s', (url) => {
    const f = fixture();
    f.replay.remember(1, url, new Headers());
    f.request();
    expect(f.nativeFetch).not.toHaveBeenCalled();
    expect(f.postMessage.mock.calls[0][0].content.status).toBe(0);
  });

  it('rejects arbitrary selection keys and signed parameter changes', () => {
    const f = fixture();
    f.replay.remember(1, address + ',lang,tlang&tlang=fr', new Headers());
    f.request('unknown', 1, {url: 'https://other.example'});
    f.request('signed', 1, {lang: 'en'});
    f.request('removed', 1, {tlang: null});
    expect(f.nativeFetch).not.toHaveBeenCalled();
    expect(f.postMessage).toHaveBeenCalledTimes(3);
  });

  it('permits unchanged signatures and unsigned track selection', async () => {
    const f = fixture();
    f.replay.remember(1, address + ',lang&kind=asr', new Headers());
    f.nativeFetch.mockResolvedValue(new Response(''));
    f.request('allowed', 1, {lang: 'de', kind: null, fmt: 'json3'});
    await jest.advanceTimersByTimeAsync(0);
    const url = new URL(String(f.nativeFetch.mock.calls[0][0]));
    expect(url.searchParams.get('lang')).toBe('de');
    expect(url.searchParams.has('kind')).toBe(false);
    expect(url.searchParams.get('fmt')).toBe('json3');
    expect(url.searchParams.get('signature')).toBe('signed');
    expect(url.searchParams.get('pot')).toBe('token');
    expect(f.postMessage.mock.calls[0][0].content).toEqual({
      operationId: 'allowed', status: 200, body: '',
    });
  });

  it('ignores foreign message sources and origins', () => {
    const f = fixture();
    f.replay.remember(1, address, new Headers());
    const content = {operationId: 'op', requestId: 1, selection: {}};
    f.message('CAPTION_REPLAY_REQUEST', content, {source: null});
    f.message('CAPTION_REPLAY_REQUEST', content, {origin: 'https://other.test'});
    expect(f.nativeFetch).not.toHaveBeenCalled();
    expect(f.postMessage).not.toHaveBeenCalled();
  });

  it('cancels once and ignores a transport resolving after cancellation',
    async () => {
      const f = fixture();
      let resolve!: (response: Response) => void;
      f.nativeFetch.mockImplementation(() => new Promise(r => {
        resolve = r;
      }));
      f.replay.remember(1, address, new Headers());
      f.request();
      f.request();
      expect(f.nativeFetch).toHaveBeenCalledTimes(1);
      f.message('CAPTION_REPLAY_CANCEL', {operationId: 'op'});
      expect(f.nativeFetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
      resolve(new Response('late'));
      await jest.advanceTimersByTimeAsync(0);
      expect(f.postMessage).toHaveBeenCalledTimes(1);
      expect(f.postMessage.mock.calls[0][0].content.error).toBe(
        'Caption replay cancelled');
      expect(jest.getTimerCount()).toBe(0);
    });

  it('times out even when the transport ignores abort', async () => {
    const f = fixture();
    f.nativeFetch.mockImplementation(() => new Promise(() => {}));
    f.replay.remember(1, address, new Headers());
    f.request();
    await jest.advanceTimersByTimeAsync(10000);
    expect(f.nativeFetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(f.postMessage.mock.calls[0][0].content.error).toBe(
      'Caption replay timed out');
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['yt-navigate-start', 'pagehide'])(
    'aborts pending work and invalidates same-video handles on %s', (event) => {
      const f = fixture();
      f.nativeFetch.mockImplementation(() => new Promise(() => {}));
      f.replay.remember(1, address, new Headers());
      f.request();
      const target = event === 'pagehide' ? f.root : f.root.document;
      target.dispatchEvent(new Event(event));
      expect(f.nativeFetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
      f.request('obsolete');
      expect(f.nativeFetch).toHaveBeenCalledTimes(1);
      expect(f.postMessage).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    });

  it('checks current video again even without a navigation event', () => {
    const f = fixture();
    f.replay.remember(1, address, new Headers());
    f.root.location.href = 'https://www.youtube.com/watch?v=other';
    f.request();
    expect(f.nativeFetch).not.toHaveBeenCalled();
  });

  it('expires handles and evicts the oldest beyond ten', async () => {
    const f = fixture();
    for (let id = 1; id <= 11; id++) {
      f.replay.remember(id, address, new Headers());
    }
    f.request('evicted', 1);
    expect(f.nativeFetch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(120000);
    f.request('expired', 11);
    expect(f.nativeFetch).not.toHaveBeenCalled();
    expect(f.postMessage).toHaveBeenCalledTimes(2);
  });

  it('reports failures generically without reflecting transport secrets',
    async () => {
      const f = fixture();
      f.replay.remember(1, address, new Headers());
      f.nativeFetch.mockRejectedValue(
        Error('Authorization: secret ' + address));
      f.request();
      await jest.advanceTimersByTimeAsync(0);
      expect(f.postMessage.mock.calls[0][0].content).toEqual({operationId: 'op',
        status: 0, body: '', error: 'Caption replay failed'});
      expect(jest.getTimerCount()).toBe(0);
    });
  it('returns an HTTP failure without retrying or exposing response headers',
    async () => {
      const f = fixture();
      f.replay.remember(1, address, new Headers());
      f.nativeFetch.mockResolvedValue(new Response('limited', {status: 429,
        headers: {'X-Private': 'response-secret'}}));
      f.request();
      await jest.advanceTimersByTimeAsync(20000);
      expect(f.nativeFetch).toHaveBeenCalledTimes(1);
      expect(f.postMessage.mock.calls[0][0].content).toEqual({operationId: 'op',
        status: 429, body: 'limited'});
      expect(jest.getTimerCount()).toBe(0);
    });
});
