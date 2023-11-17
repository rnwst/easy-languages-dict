'use strict';

/**
 * Escape potential HTML.
 * @param {string} text - OCRed text
 * @return {string} - Escaped text
 */
export function escapeHTML(text) {
  const elt = document.createElement('span');
  elt.textContent = text;
  return elt.textContent;
}


/**
 * Create string to be sent to translation API by concatenating the sentence's
 * words and wrapping the word of interest in `<span>` tags.
 * @param {array} sentence - Array of words comprising sentence
 * @param {number} wordIndex - Index of word to be translated in context
 * @return {string} - String to be sent to translation API
 */
function wrapWordInSpanTags(sentence, wordIndex) {
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
    const error = new Error(response.message);
    error.name = response.name;
    error.code = response.code;
    throw error;
  }
}


/**
 * Return word wrapped in `<span>` tags.
 * @param {string} translation - Received translation
 * @return {string} - Word wrapped in `<span>` tags
 */
export function wordInSpanTags(translation) {
  return translation.match(/<span>(?<word>.*?)<\/span>/)?.groups?.word;
}


/**
 * Remove punctuation from the end of a word. When an individual word from a
 * sentence is translated, any punctuation should be removed from the
 * translation.
 * @param {string} wordWithPunctuation - Word with potential punctuation
 * @return {string} - Word without punctuation
 */
export function removePunctuation(wordWithPunctuation) {
  return wordWithPunctuation.match(/^(?<word>.*?)[.,:;?!]?$/).groups.word;
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
 * Translate text by making a request to the background script and parsing the
 * response (and dealing with potential errors).
 * @param {string} text - Text to be translated
 * @param {object} translationOptions - Translation options (languages)
 */
async function translate(text, translationOptions) {
  // Firefox supports usage of the `chrome` object for compatibility reasons.
  return chrome.runtime.sendMessage({text, translationOptions})
      .then((response) => parseResponse(response))
      .catch((error) => handleTranslationError(error));
}


/**
 * Translate a word from a sentence.
 *
 * Translate a word both in and out of context. Context-specific word
 * translation relies on the translation API being HTML capable. By wrapping the
 * word to be translated in a tag, its translated equivalent may be identified
 * from the response (as it is wrapped in the same tag, ideally at least).
 *
 * @param {array} sentence - List of words forming sentence containing word to
 * be translated
 * @param {number} wordIndex - Array index of word to be translated
 * @param {object} translationOptions - Translation options (languages)
 * @return {object} - Promise resolving to translated word
 */
export default async function translateWord(
    sentence, wordIndex, translationOptions) {
  const word = escapeHTML(sentence[wordIndex]);
  const wordWithContext = wrapWordInSpanTags(sentence, wordIndex);
  const outOfContextTranslationPromise =
    translate(word, translationOptions)
        // To prevent XSS attacks if the server returns malicious content, we
        // need to sanitize the response.
        .then((translation) => escapeHTML(removePunctuation(translation)));
  const inContextTranslationPromise =
    translate(wordWithContext, translationOptions)
        .then((translation) => {
          // Google and Bing Translate frequently fail at contextual
          // translation. Google often returns a translation which doesn't
          // contain any `<span>` tags, and Bing often returns a translation
          // where the `<span>` tags are empty.
          const translatedWord = removePunctuation(wordInSpanTags(translation));
          if (!translatedWord || (translatedWord === '')) {
            return '-';
          } else {
            // To prevent XSS attacks if the server returns malicious content,
            // we need to sanitize the response.
            return escapeHTML(translatedWord);
          }
        });
  const outOfContextTranslation = await outOfContextTranslationPromise;
  const inContextTranslation = await inContextTranslationPromise;
  if (outOfContextTranslation.toLowerCase() ===
      inContextTranslation.toLowerCase()) {
    return inContextTranslation;
  } else {
    return '' +
        '<div><div style="font-size: 0.65em">Out of context:</div>' +
        `${outOfContextTranslation.toLowerCase()}</div>` +
        '<div style="height: 0.3em"></div>' +
        '<div><div style="font-size: 0.65em">In context:</div>' +
        `${inContextTranslation}</div>`;
  }
}
