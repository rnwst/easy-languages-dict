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
  return fetch(url)
    .then((response) => response.json())
    .then((json) => json[0][0][0] as string);
}
