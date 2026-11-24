import googleTranslate from './translators/googleTranslate.js';
import bingTranslate from './translators/bingTranslate.js';
import deepL from './translators/deepL.js';
import {TranslatorRequest} from '../../types.js';
import {JSONSerializable} from '../../types.js';


/**
 * For cashing of translations, to prevent unnecessary requests to APIs, which
 * only allow a limited number of requests in a given timeframe.
 */
const dicts: Record<string, Record<string, Promise<string>>> = {};


export type TranslationMsg = {
  type: 'translation';
  translation: string;
};


export type ErrorMsg = {
  type: 'error';
  name: string;
  message: string;
  code: string;
};


/**
 * Function registered as a listener in background script. Responds to
 * translation requests from content script.
 */
export default function respondToTranslationRequest(
  message: TranslatorRequest,
  _: unknown,
  sendResponse: (response: JSONSerializable) => void,
): boolean {
  const translate = (): Promise<string> => {
    switch (message.translator) {
      case 'google': {
        const {translator: _, ...request} = message;
        return googleTranslate(request);
      }
      case 'bing': {
        const {translator: _, ...request} = message;
        return bingTranslate(request);
      }
      case 'deepL': {
        const {translator: _, ...request} = message;
        return deepL(request);
      }
    }
  };

  const dictName = JSON.stringify([
    message.translator, message.langCodes.from, message.langCodes.to,
  ]);
  if (!(dictName in dicts)) {
    dicts[dictName] = {};
  }

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
        } as TranslationMsg);
      })
      .catch((error: Error & { code?: string }) => {
        console.error('An error occurred while attempting to translate ' +
                        `"${message.text}":\n`, error);
        // Delete entry from `dict`. This prevents e.g. a temporary lack of
        // internet connection from returning an error even when the
        // connection is restored.
        delete dicts[dictName][message.text];
        sendResponse({
          // 'JSON serialize' error before sending.
          type: 'error',
          name: error.name,
          message: error.message,
          code: error.code,
        } as ErrorMsg);
      });
  };

  // Translation already cached?
  if (typeof dicts[dictName][message.text] === 'undefined') {
    // No, so send request for translation.
    const translationPromise = translate();
    // Cache translation.
    dicts[dictName][message.text] = translationPromise;
    sendTranslation(translationPromise);
  } else {
    // Retrieve cached translation.
    const translationPromise = dicts[dictName][message.text];
    sendTranslation(translationPromise);
  }

  // To keep the `sendResponse()` function alive after the listener returns, we
  // need to return `true`:
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage
  // Unfortunately, the other option described of returning a Promise is not
  // supported in Chrome:
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage#browser_compatibility
  return true;
}
