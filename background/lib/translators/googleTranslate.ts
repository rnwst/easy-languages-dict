/**
 * Translate text with the Google Translate API.
 * Inspired by
 * https://github.com/ssut/py-googletrans/issues/268#issuecomment-761217163.
 */
export default function googleTranslate(
  text: string,
  options: { from: string; to: string },
): Promise<string> {
  const urlAppendix =
      '&sl=' + options.from +
      '&tl=' + options.to +
      '&q=' + encodeURIComponent(text);
  const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
      urlAppendix;
  return fetch(url)
    .then((response) => response.json())
    .then((json) => json[0][0][0] as string);
}
