'use strict';

import googleTranslate from './translators/googleTranslate.js';
import bingTranslate from './translators/bingTranslate.js';


/**
 * For cashing of translations, to prevent unnecessary requests to APIs, which
 * only allow a limited number of requests in a given timeframe.
 * @type {object}
 */
const dicts = {};


/**
 * Generate key name for translations to be stored in `dicts`.
 * @param {string} translator - Translator
 * @param {object} languageCodes - Language codes
 * @return {string} - Key name for `dict`
 */
export function genDictName(translator, languageCodes) {
  return translator + languageCodes.from + '-' + languageCodes.to;
}


/**
 * Get translation function depending on which translator is to be used.
 * @param {string} translator - Translation translator
 * @return {function} - Translation function
 */
function getTranslatorFunction(translator) {
  if (translator === 'bing') return bingTranslate;
  if (translator === 'google') return googleTranslate;
}


/**
 * Function registered as a listener in background script. Responds to
 * translation requests from content script.
 * @param {object} message - Request object received from content script
 * @param {object} sender - Sender object - not used
 * @param {function} sendResponse - Function to respond to content script
 * @return {boolean} - `true`, used to keep `sendResponse` function alive
 */
export default function respondToTranslationRequest(
    message, sender, sendResponse) {
  const text = message.text;
  const translate = getTranslatorFunction(message.translator);

  const dictName = genDictName(message.translator, message.languageCodes);
  (dictName in dicts) || (dicts[dictName] = {});

  const sendTranslation = (translationPromise) => {
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
            translation: translation,
          });
        })
        .catch((error) => {
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
    const translationPromise = translate(text, message.languageCodes);
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
