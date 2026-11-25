import {DeepLTranslatorRequest} from '../../../types.js';

/**
 * Translate text using the DeepL API.
 * Inspired by the DeepL browser extension.
 */
export default async function deepL(
  request: Omit<DeepLTranslatorRequest, 'translator'>,
): Promise<string> {
  // DeepL's internal tarnslation endpoint expects BCP 47 casing (e.g. en-GB,
  // zh-Hans), rather than the uppercase codes used by the legacy JSON-RPC
  // endpoint.
  const targetAliases: Record<string, string> = {
    EN: 'en-US', PT: 'pt-BR', ZH: 'zh-Hans',
  };
  const body = JSON.stringify({
    text: [request.text],
    source_lang: new Intl.Locale(request.langCodes.from).toString(),
    target_lang: targetAliases[request.langCodes.to] ??
      new Intl.Locale(request.langCodes.to).toString(),
    tag_handling: 'html',
  });

  const response = await fetch('https://oneshot-free.www.deepl.com/v1/translate', {
    method: 'POST',
    headers: {
      Authorization: 'None',
      'Content-Type': 'application/json; charset=utf-8',
    },
    referrer: 'https://www.deepl.com/',
    body,
  });

  if (response.status != 200) {
    throw new Error(`Received status code ${response.status} from DeepL.`);
  }

  const responseData = await response.json();
  const translation = responseData?.translations?.[0]?.text;
  if (typeof translation !== 'string' || translation.trim() === '') {
    throw new Error('DeepL returned no translation.');
  }
  if (translation.includes("You're using an older version of DeepL.")) {
    throw new Error('DeepL no longer supports this extension client version.');
  }
  return translation;
}
