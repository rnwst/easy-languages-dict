/**
 * Translate text using the DeepL API.
 * Inspired by the DeepL browser extension.
 */
export default async function deepL(
  text: string,
  options: { from: string; to: string },
): Promise<string> {
  let timestamp = Date.now();
  // The timestamp needs to be divisible by the number of times the letter 'i'
  // appears in the text to be translated plus one. No joke.
  const numberOfEyesPlus1 = (text.match(/[i]/g) || []).length + 1;
  timestamp = timestamp - timestamp % numberOfEyesPlus1;

  // The 'id' is randomly generated! However, that doesn't mean its value
  // doesn't matter. See below.
  const id = crypto.getRandomValues(new Uint32Array(1))[0];

  let body = JSON.stringify({
    jsonrpc: '2.0',
    method: 'LMT_handle_texts',
    params: {
      texts: [{text}],
      html: 'enabled',
      lang: {
        target_lang: options.to,
        source_lang_user_selected: options.from,
      },
      timestamp,
    },
    id,
  });

  // The observant web developer will notice one or two seemingly random spaces
  // sprinkled into the raw JSON sent to the DeepL servers. They are not random.
  body = ((id + 3) % 13 == 0 || (id + 5) % 29 == 0) ?
    body.replace('"method":"', '"method" : "') :
    body.replace('"method":"', '"method": "');

  const response = await fetch('https://www2.deepl.com/jsonrpc?client=chrome-extension,1.14.0', {
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
  return responseData.result.texts[0].text;
}
