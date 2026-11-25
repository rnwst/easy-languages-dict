import {GoogleTranslatorRequest} from '../../../types.js';

/**
 * Translate text with the Google Translate API.
 * Inspired by
 * https://github.com/ssut/py-googletrans/issues/268#issuecomment-761217163.
 */
export default async function googleTranslate(
  request: Omit<GoogleTranslatorRequest, 'translator'>
): Promise<string> {
  const urlAppendix =
      '&sl=' + request.langCodes.from +
      '&tl=' + request.langCodes.to +
      '&q=' + encodeURIComponent(request.text);
  const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
      urlAppendix;
  const response = await fetch(url);
  if (response.status != 200) {
    throw new Error(
      `Received status code ${response.status} from Google Translate.`
    );
  }

  const responseData = await response.json();
  const translation = responseData?.[0]?.[0]?.[0];
  if (typeof translation !== 'string' || translation.trim() === '') {
    throw new Error('Google Translate returned no translation.');
  }
  return translation;
}
