/**
 * Escape potential HTML.
 */
export function escapeHTML(text: string): string {
  const elt = document.createElement('b');
  elt.textContent = text;
  return elt.textContent;
}


/**
 * Create string to be sent to translation API by concatenating the sentence's
 * words and wrapping the word of interest in `<b>` tags.
 */
function wrapWordInTags(sentence: string[], wordIndex: number): string {
  return sentence.map((word, index) => {
    word = escapeHTML(word);
    return (index === wordIndex) ? '<b>' + word + '</b>' : word;
  }).join(' ');
}


/**
 * Parse response received from background script and return translated string.
 * Throw an error if an error was received. Since only JSON serializable objects
 * can be sent by the background script, we need to transform the response
 * received back into its original form (either a translation or an error).
 */
export function parseResponse(response): string {
  if (response.type === 'translation') {
    return response.translation;
  } else if (response.type === 'error') {
    console.log(response);
    const error: Error & { code?: string } = new Error(response.message);
    error.name = response.name;
    error.code = response.code;
    throw error;
  }
}


/**
 * Return word wrapped in `<b>` tags.
 */
export function wordInTags(translation: string): string | undefined {
  return translation.match(/<b>(?<word>.*?)<\/b>/)?.groups?.word;
}


/**
 * Remove punctuation from the end of a word. When an individual word from a
 * sentence is translated, any punctuation should be removed from the
 * translation.
 */
export function removePunctuation(wordWithPunctuation: string): string {
  return wordWithPunctuation
      ?.match(/^(?<word>.*?)[.,:;?!]?$/)?.groups?.word ?? wordWithPunctuation;
}


/**
 * Translate text by making a request to the background script and parsing the
 * response (and dealing with potential errors).
 */
async function translate(text: string, translator: string, langCode: string):
    Promise<string> {
  const langCodes = {
    from: langCode,
    to: (translator === 'deepL') ? 'EN' : 'en',
  };
  // Firefox supports usage of the `chrome` object for compatibility reasons.
  return chrome.runtime.sendMessage({text, translator, langCodes})
      .then((response) => parseResponse(response));
}


/**
 * Translate a word from a sentence.
 *
 * Translate a word both in and out of context. Context-specific word
 * translation relies on the translation API being HTML capable. By wrapping the
 * word to be translated in a tag, its translated equivalent may be identified
 * from the response (as it is wrapped in the same tag, ideally at least).
 */
export default async function translateWord(
  sentence: string[],
  wordIndex: number,
  lang: Record<string, string>,
): Promise<string> {
  const word = escapeHTML(sentence[wordIndex]);
  const outOfContextTranslationPromise =
    translate(
        word,
        lang.defaultOutOfContextTranslator,
        lang[lang.defaultOutOfContextTranslator + 'Code'],
    )
        // To prevent XSS attacks if the server returns malicious content, we
        // need to sanitize the response.
        .then((translation) => escapeHTML(removePunctuation(translation)));

  const wordWithContext = wrapWordInTags(sentence, wordIndex);
  const inContextTranslationPromise =
    (sentence.length === 1) ?
    // If we are only translating one word, don't send two translation requests.
    outOfContextTranslationPromise :
    translate(
        wordWithContext,
        lang.defaultInContextTranslator,
        lang[lang.defaultInContextTranslator + 'Code'],
    )
        .then((translation) => {
          // Google and Bing Translate frequently fail at contextual
          // translation. Google often returns a translation which doesn't
          // contain any `<b>` tags, and Bing often returns a translation
          // where the `<b>` tags are empty.
          const translatedWord =
              removePunctuation(wordInTags(translation) ?? '');
          if (translatedWord === '') {
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
        '<div><div class="annotation">Out of context:</div>' +
        `${outOfContextTranslation.toLowerCase()}</div>` +
        '<div style="height: 0.3em"></div>' +
        '<div><div class="annotation">In context:</div>' +
        `${inContextTranslation}</div>`;
  }
}
