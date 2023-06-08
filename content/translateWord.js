'use strict';

/**
 * Escape potential HTML in OCRed text.
 * @param {string} text - OCRed text
 * @return {string} - Escaped text
 */
export function escapeHTML(text) {
  const elt = document.createElement('span');
  elt.innerText = text;
  return elt.innerHTML;
}


/**
 * Create string to be sent to translation API by concatenating the sentence's
 * words and wrapping the word of interest in `<span>` tags.
 * @param {array} sentence - Array of words comprising sentence
 * @param {number} wordIndex - Index of word to be translated in context
 * @return {string} - String to be sent to translation API
 */
function createStringToBeTranslated(sentence, wordIndex) {
  return sentence.map((word, index) => {
    word = escapeHTML(word);
    return (index === wordIndex) ? '<span>' + word + '</span>' : word;
  }).join(' ');
}


/**
 * Parse response received from background script and return translated string.
 * Throw an error if an error was received. Since only JSON serializable objects
 * can be sent by the background script, we need to transform the response
 * received back into its original form (either a translation or an error).
 * @param {object} response - Response received from background script
 * @return {object} - Translated string
 */
export function parseResponse(response) {
  if (response.type === 'translation') {
    return response.translation;
  } else if (response.type === 'error') {
    console.log(response);
    error = new Error(response.message);
    error.name = response.name;
    error.code = response.code;
    throw error;
  }
}


/**
 * Return word wrapped in `<span>` tags. Return
 * @param {string} translation - Received translation
 * @return {string} - Word wrapped in `<span>` tags
 */
export function wordInSpanTags(translation) {
  return translation.match(/<span>(?<word>.+?)<\/span>/)?.groups?.word;
}


/**
 * Remove punctuation from the end of a word. When an individual word from a
 * sentence is translated, any punctuation should be removed from the
 * translation.
 * @param {string} wordWithPunctuation - Word with potential punctuation
 * @return {string} - Word without punctuation
 */
export function removePunctuation(wordWithPunctuation) {
  return wordWithPunctuation.match(/^(?<word>.*?)[.,:;?]?$/).groups.word;
}


/**
 * Log error, and throw error with user-friendly error message.
 * @param {error} error - Error to be handled
 */
export function handleTranslationError(error) {
  console.error('easy-languages-dict: Translation error occurred:\n', error);
  if (error.message === 'Failed to fetch') {
    // eslint-disable-next-line quotes
    throw new Error("You don't currently have a working internet connection.");
  } else {
    throw new Error('An unfamiliar error occurred, see console output for ' +
                     'more details.');
  }
}


/**
 * Translate a word from a sentence. Executed in content script. This function
 * is API agnostic, and delegates the actual translation to the API-specific
 * function executed in the background script. It communicates with the
 * background script by exchanging messages.
 *
 * Context-specific word translation relies on most translation APIs being HTML
 * capable. By wrapping the word to be translated in a tag, its translated
 * equivalent may be identified from the response (as it is wrapped in the same
 * tag, ideally at least).
 *
 * @param {array} sentence - List of words forming sentence containing word to
 * be translated
 * @param {number} wordIndex - Array index of word to be translated
 * @param {object} translationOptions - Translation options (languages)
 * @return {object} - Promise resolving to translated word
 */
export default async function translateWord(
    sentence, wordIndex, translationOptions) {
  const stringToBeTranslated = createStringToBeTranslated(sentence, wordIndex);
  // Firefox supports usage of the `chrome` object for compatibility reasons.
  return chrome.runtime.sendMessage({stringToBeTranslated, translationOptions})
      .then((response) => {
        const parsedResponse = parseResponse(response);
        // Google Translate quite frequently fails at contextual translation,
        // and returns a translation which doesn't contain any `<span>` tags. If
        // that happens, the word needs to be translated without context
        // instead.
        if (wordInSpanTags(parsedResponse)) {
          return removePunctuation(wordInSpanTags(parsedResponse));
        } else {
          const stringToBeTranslated =
              removePunctuation(escapeHTML(sentence[wordIndex]));
          return chrome.runtime
              .sendMessage({stringToBeTranslated, translationOptions})
              .then((response) => parseResponse(response));
        }
      })
      .catch((error) => handleTranslationError(error));
}
