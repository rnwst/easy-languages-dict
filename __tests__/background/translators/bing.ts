import type bingTranslate from
  '../../../background/lib/translators/bingTranslate.js';
import type * as utils from '../../../background/lib/utils.js';

describe('Bing Translate', () => {
  const authURL = 'https://www.bing.com/translator';
  const authHTML = '<html><script>var config = {IG:"test-ig"}; ' +
    'var params_AbusePreventionHelper = [123456,"test-token",3600000];' +
    '</script><div data-iid="translator.1"></div></html>';
  const authData = {
    ig: 'test-ig', iid: 'translator.1', token: 'test-token', key: 123456,
  };
  const request = {
    text: 'Ich sitze auf der <b>Bank</b> am Fluss. & + ? # ü',
    langCodes: {from: 'de', to: 'en'},
  } as const;
  const translation = 'I’m sitting on the <b>bench</b> by the river. & + ? # ü';
  const responseData = [{translations: [{text: translation, to: 'en'}]}];
  let translate: typeof bingTranslate;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let getStoredData: jest.SpiedFunction<typeof utils.getStoredData>;
  let storeData: jest.SpiedFunction<typeof utils.storeData>;

  beforeEach(async () => {
    // Each test starts with an empty module-level authentication promise.
    jest.resetModules();
    const storage = await import('../../../background/lib/utils.js');
    getStoredData = jest.spyOn(storage, 'getStoredData')
      .mockResolvedValue(undefined);
    storeData = jest.spyOn(storage, 'storeData').mockResolvedValue(undefined);
    translate = (await import(
      '../../../background/lib/translators/bingTranslate.js'
    )).default;
    jest.spyOn(console, 'debug').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (url === authURL) return new Response(authHTML);
      return new Response(JSON.stringify(responseData));
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('extracts authentication and encodes text and context tags', async () => {
    await expect(translate(request)).resolves.toBe(translation);
    expect(getStoredData).toHaveBeenCalledWith('bingTranslateAuthData');
    expect(storeData).toHaveBeenCalledWith('bingTranslateAuthData', authData);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(1, authURL);
    const [url, init] = fetchSpy.mock.calls[1];
    const parsedURL = new URL(String(url));
    expect(parsedURL.origin + parsedURL.pathname).toBe(
      'https://www.bing.com/ttranslatev3',
    );
    expect(Object.fromEntries(parsedURL.searchParams)).toEqual({
      isVertical: '1', IG: 'test-ig', IID: 'translator.1',
    });
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-agent': navigator.userAgent,
      },
    });
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toEqual({
      fromLang: 'de', text: request.text, to: 'en',
      token: 'test-token', key: '123456',
      tryFetchingGenderDebiasedTranslations: 'true',
    });
  });

  it('shares authentication for concurrent and later requests', async () => {
    await expect(Promise.all([
      translate(request), translate({...request, text: 'Hallo'}),
    ])).resolves.toEqual([translation, translation]);
    expect(fetchSpy.mock.calls.filter(([url]) => url === authURL))
      .toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(storeData).toHaveBeenCalledTimes(1);

    await expect(translate(request)).resolves.toBe(translation);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(getStoredData).toHaveBeenCalledTimes(1);
  });

  it('uses stored authentication without fetching the page', async () => {
    getStoredData.mockResolvedValue(authData);
    await expect(translate(request)).resolves.toBe(translation);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('IG=test-ig');
    expect(storeData).not.toHaveBeenCalled();
  });

  it('refreshes expired authentication and retries with new data', async () => {
    getStoredData.mockResolvedValue({
      ig: 'old-ig', iid: 'old-iid', token: 'old-token', key: 1,
    });
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      statusCode: 401,
    })));

    await expect(translate(request)).resolves.toBe(translation);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[0][0]).toContain('IG=old-ig&IID=old-iid');
    expect(fetchSpy).toHaveBeenNthCalledWith(2, authURL);
    expect(fetchSpy.mock.calls[2][0]).toContain('IG=test-ig&IID=translator.1');
    expect(new URLSearchParams(String(fetchSpy.mock.calls[2][1]?.body))
      .get('token')).toBe('test-token');
    expect(storeData).toHaveBeenCalledWith('bingTranslateAuthData', authData);
  });

  it('shares authentication refresh for concurrent failures', async () => {
    getStoredData.mockResolvedValue({...authData, ig: 'expired'});
    fetchSpy.mockImplementation(async url => {
      if (url === authURL) return new Response(authHTML);
      if (String(url).includes('IG=expired')) {
        return new Response(JSON.stringify({statusCode: 401}));
      }
      return new Response(JSON.stringify(responseData));
    });

    await expect(Promise.all([
      translate(request), translate({...request, text: 'Hallo'}),
    ])).resolves.toEqual([translation, translation]);
    expect(fetchSpy.mock.calls.filter(([url]) => url === authURL))
      .toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(storeData).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429, 500])('retries HTTP %s only once', async status => {
    getStoredData.mockResolvedValue(authData);
    fetchSpy.mockImplementation(async url => url === authURL ?
      new Response(authHTML) : new Response('Service unavailable', {status}));

    await expect(translate(request)).rejects.toThrow(
      `Received status code ${status} from Bing Translate.`,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([401, 429, 500])('retries JSON error %s only once', async status => {
    getStoredData.mockResolvedValue(authData);
    fetchSpy.mockImplementation(async url => url === authURL ?
      new Response(authHTML) :
      new Response(JSON.stringify({statusCode: status})));

    await expect(translate(request)).rejects.toThrow(
      `Received status code ${status} from Bing Translate.`,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([
    null, {}, [], [null], [{}], [{translations: []}],
    [{translations: [null]}], [{translations: [{text: 123}]}],
    [{translations: [{text: ''}]}], [{translations: [{text: '   '}]}],
  ])('rejects missing or invalid translations: %j', async response => {
    getStoredData.mockResolvedValue(authData);
    fetchSpy.mockImplementation(async url => url === authURL ?
      new Response(authHTML) : new Response(JSON.stringify(response)));

    await expect(translate(request)).rejects.toThrow(
      'Bing Translate returned no translation.',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('rejects non-JSON translation responses after one retry', async () => {
    getStoredData.mockResolvedValue(authData);
    fetchSpy.mockImplementation(async url => url === authURL ?
      new Response(authHTML) : new Response('<html>Blocked</html>'));
    await expect(translate(request)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('propagates persistent network failures for fallback', async () => {
    getStoredData.mockResolvedValue(authData);
    fetchSpy.mockImplementation(async url => {
      if (url === authURL) return new Response(authHTML);
      throw new TypeError('Failed to fetch');
    });
    await expect(translate(request)).rejects.toThrow('Failed to fetch');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([403, 429, 500])('rejects authentication HTTP %s', async status => {
    fetchSpy.mockResolvedValueOnce(new Response('Blocked', {status}));
    await expect(translate(request)).rejects.toThrow(
      `Received status code ${status} from Bing Translate authentication.`,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(storeData).not.toHaveBeenCalled();
  });

  it.each([
    '<html>Challenge page</html>',
    authHTML.replace('IG:"test-ig"', ''),
    authHTML.replace('data-iid="translator.1"', ''),
    authHTML.replace('[123456,"test-token",3600000]', '[]'),
    authHTML.replace('[123456,"test-token",3600000]', 'null'),
  ])('rejects incomplete authentication pages: %s', async html => {
    fetchSpy.mockResolvedValueOnce(new Response(html));
    await expect(translate(request)).rejects.toThrow(
      'Bing Translate returned no authentication data.',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(storeData).not.toHaveBeenCalled();
  });

  it('rejects malformed authentication JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      authHTML.replace('[123456,"test-token",3600000]', '[invalid]'),
    ));
    await expect(translate(request)).rejects.toThrow();
    expect(storeData).not.toHaveBeenCalled();
  });

  it('recovers on a later request after authentication fails', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(translate(request)).rejects.toThrow('Failed to fetch');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await expect(translate(request)).resolves.toBe(translation);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('recovers on a later request after auth refresh fails', async () => {
    getStoredData.mockResolvedValueOnce(authData);
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      statusCode: 401,
    }))).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(translate(request)).rejects.toThrow('Failed to fetch');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await expect(translate(request)).resolves.toBe(translation);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});
