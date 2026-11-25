import deepL from '../background/lib/translators/deepL.js';
import {DeeplToLangCode} from '../types.js';

describe('DeepL Oneshot', () => {
  const request = {
    text: 'Ich sitze auf der <b>Bank</b> am Fluss.',
    langCodes: {from: 'DE', to: 'EN-GB'},
  } as const;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({translations: [{
        detected_source_language: 'de',
        text: 'I’m sitting on the <b>bench</b> by the river.',
      }]}),
    ));
  });

  afterEach(() => jest.restoreAllMocks());

  it('is correctly mocked', async () => {
    await expect(deepL(request)).resolves.toBe(
      'I’m sitting on the <b>bench</b> by the river.',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://oneshot-free.www.deepl.com/v1/translate');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {Authorization: 'None'},
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      text: [request.text], source_lang: 'de', target_lang: 'en-GB',
      tag_handling: 'html',
    });
  });

  it.each<[DeeplToLangCode, string]>([
    ['DE', 'de'], ['EN', 'en-US'], ['EN-US', 'en-US'],
    ['PT', 'pt-BR'], ['PT-PT', 'pt-PT'], ['ES-419', 'es-419'],
    ['ZH', 'zh-Hans'], ['ZH-HANS', 'zh-Hans'], ['ZH-HANT', 'zh-Hant'],
  ])('normalizes target %s to %s', async (to, expected) => {
    await deepL({...request, langCodes: {from: 'EN', to}});
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({
      source_lang: 'en', target_lang: expected,
    });
  });

  it.each([403, 429, 500])('rejects HTTP %s without retrying', async status => {
    fetchSpy.mockResolvedValue(new Response('Service unavailable', {status}));
    await expect(deepL(request)).rejects.toThrow(
      `Received status code ${status} from DeepL.`,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    null, {}, {translations: []}, {translations: [null]},
    {translations: [{text: 123}]}, {translations: [{text: ''}]},
    {translations: [{text: '   '}]},
    {result: {texts: [{text: 'Legacy response'}]}},
  ])('rejects missing or invalid translations: %j', async response => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response)));
    await expect(deepL(request)).rejects.toThrow(
      'DeepL returned no translation.',
    );
  });

  it('propagates network failures for provider fallback', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(deepL(request)).rejects.toThrow('Failed to fetch');
  });
});
