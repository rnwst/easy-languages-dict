import googleTranslate from './translators/googleTranslate';
import bingTranslate from './translators/bingTranslate';
import deepL from './translators/deepL';


/**
 * For cashing of translations, to prevent unnecessary requests to APIs, which
 * only allow a limited number of requests in a given timeframe.
 */
const dicts: Record<string, Record<string, Promise<string>>> = {};


/**
 * Generate key name for translations to be stored in `dicts`.
 */
export function genDictName(
  translator: string,
  langCodes: { from: string; to: string },
): string {
  return translator + langCodes.from + '-' + langCodes.to;
}


/**
 * Get translation function depending on which translator is to be used.
 */
function getTranslatorFunction(
  translator: string,
): (text: string, options: { from: string; to: string }) => Promise<string> {
  if (translator === 'bing') return bingTranslate;
  if (translator === 'google') return googleTranslate;
  return deepL;
}


/**
 * Function registered as a listener in background script. Responds to
 * translation requests from content script.
 */
export default function respondToTranslationRequest(
  message: {
    text: string;
    translator: string;
    langCodes: { from: string; to: string }
  },
  _: unknown,
  sendResponse: (response) => void,
): boolean {
  const text = message.text;
  const translate = getTranslatorFunction(message.translator);

  const dictName = genDictName(message.translator, message.langCodes);
  if (!(dictName in dicts)) {
    dicts[dictName] = {};
  }

  /**
   * @param{Promise<string>} translationPromise
   */
  const sendTranslation = (translationPromise: Promise<string>) => {
    // Sending a promise synchronously as a response results in the content
    // script receiving an empty object. This is because `sendResponse` only
    // works with JSON serializable objects, and a promise is not. We cannot
    // send an error for the same reason. See here:
    // https://stackoverflow.com/questions/76988929/how-to-pass-error-from-extension-service-worker-to-content-script
    // Thus, we need to send the actual translation asynchronously once the
    // promise is fulfilled. When an error occurs, it is 'JSON serialized'
    // before it is sent.
    translationPromise
        .then((translation) => {
          sendResponse({
            type: 'translation',
            translation,
          });
        })
        .catch((error: Error & { code?: string }) => {
          console.error('An error occurred while attempting to translate ' +
                        `"${text}":\n`, error);
          // Delete entry from `dict`. This prevents e.g. a temporary lack of
          // internet connection from returning an error even when the
          // connection is restored.
          delete dicts[dictName][text];
          sendResponse({
            // 'JSON serialize' error before sending.
            type: 'error',
            name: error.name,
            message: error.message,
          });
        });
  };

  // Translation already cached?
  if (typeof dicts[dictName][text] === 'undefined') {
    // No, so send request for translation.
    const translationPromise = translate(text, message.langCodes);
    // Cache translation.
    dicts[dictName][text] = translationPromise;
    sendTranslation(translationPromise);
  } else {
    // Retrieve cached translation.
    const translationPromise = dicts[dictName][text];
    sendTranslation(translationPromise);
  }

  // To keep the `sendResponse()` function alive after the listener returns, we
  // need to return `true`:
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage
  // Unfortunately, the other option described of returning a promise is not
  // supported in Chrome:
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage#browser_compatibility
  return true;
}
