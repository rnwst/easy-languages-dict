import googleTranslate from
  '../../../background/lib/translators/googleTranslate.js';

describe('Google Translate', () => {
  const request = {
    text: 'Ich sitze auf der <b>Bank</b> am Fluss. & + ? # ü',
    langCodes: {from: 'de', to: 'en-GB'},
  } as const;
  const translation = 'I’m sitting on the <b>bench</b> by the river. & + ? # ü';
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        [[translation, request.text, null, null, 10]], null, 'de',
      ])),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('encodes the request and preserves context tags', async () => {
    await expect(googleTranslate(request)).resolves.toBe(translation);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    const parsedURL = new URL(String(url));
    expect(parsedURL.origin + parsedURL.pathname).toBe(
      'https://translate.googleapis.com/translate_a/single',
    );
    expect(Object.fromEntries(parsedURL.searchParams)).toEqual({
      client: 'gtx', dt: 't', sl: 'de', tl: 'en-GB', q: request.text,
    });
    expect(String(url)).toContain(`q=${encodeURIComponent(request.text)}`);
  });

  it.each([403, 429, 500])('rejects HTTP %s without retrying', async status => {
    fetchSpy.mockResolvedValue(new Response('Service unavailable', {status}));
    await expect(googleTranslate(request)).rejects.toThrow(
      `Received status code ${status} from Google Translate.`,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    null, {}, [], [null], [[]], [[null]], [[[123]]], [[['']]], [[['   ']]],
  ])('rejects missing or invalid translations: %j', async response => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response)));
    await expect(googleTranslate(request)).rejects.toThrow(
      'Google Translate returned no translation.',
    );
  });

  it('rejects non-JSON responses', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>Blocked</html>'));
    await expect(googleTranslate(request)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('propagates network failures for provider fallback', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(googleTranslate(request)).rejects.toThrow('Failed to fetch');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
