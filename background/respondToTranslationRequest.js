'use strict';

// eslint-disable-next-line no-unused-vars
import googleTranslate from './googleTranslate.js';
import bingTranslate from './bingTranslate.js';


/**
 * For cashing of translations, to prevent unnecessary requests to APIs, which
 * only allow a limited number of requests in a given timeframe.
 * @type {object}
 */
const dicts = {};


/**
 * Generate key name for translations to be stored in `dicts`.
 * @param {object} translationOptions - Object containing translation languages
 * @return {string} - Key name for `dict`
 */
export function genDictName(translationOptions) {
  return translationOptions.from + '-' + translationOptions.to;
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
  const text = message.stringToBeTranslated;
  const options = message.translationOptions;

  const dictName = genDictName(options);
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
    const translationPromise = bingTranslate(text, options);
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
