import {ErrorMsg, TranslationMsg}
  from '../../background/lib/respondToTranslationRequest.js';
import {
  bingTranslateLangCodes,
  deeplFromLangCodes,
  googleTranslateLangCodes
} from '../../lang-codes.js';
import {
  BingTranslateLangCode,
  DeeplFromLangCode,
  GoogleTranslateLangCode,
  Translator,
  TranslatorRequest,
  YTLanguageCode
} from '../../types.js';

/** A broken extension connection cannot be fixed by switching translators. */
export class TranslationConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationConnectionError';
  }
}

/**
 * Escape potential HTML.
 */
export function escapeHTML(text: string): string {
  const elt = document.createElement('b');
  elt.textContent = text;
  return elt.innerHTML;
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
export function parseResponse(response: TranslationMsg | ErrorMsg): string {
  if (!response || typeof response !== 'object') {
    throw new TranslationConnectionError(
      'The extension did not respond. Refresh this YouTube page to reconnect.',
    );
  }
  if (response.type === 'translation') {
    return response.translation;
  } else {
    const error: Error & { code?: string } = new Error(response?.message);
    error.name = response?.name;
    error.code = response?.code;
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
 * Check whether a code belongs to a translator's supported language list.
 */
function includes<T extends readonly string[]>(
  arr: T,
  value: string
): value is T[number] {
  return (arr as readonly string[]).includes(value);
}


function yt2DeepLFromCode(yt: YTLanguageCode): DeeplFromLangCode | undefined {
  // Exceptions.
  if (yt === 'zh') return 'ZH';
  if (yt === 'no') return 'NB';
  const upper = yt.toUpperCase();
  return includes(deeplFromLangCodes, upper) ? upper : undefined;
}


function yt2GoogleTranslateCode(
  yt: YTLanguageCode
): GoogleTranslateLangCode | undefined {
  // Manual exceptions
  if (yt === 'en') return 'en-US';
  if (yt === 'zh') return 'zh-CN';
  if (yt === 'he') return 'iw';
  if (includes(googleTranslateLangCodes, yt)) {
    // here yt is narrowed to GoogleTranslateLangCode
    return yt;
  }
  return undefined;
}


export function yt2BingTranslateCode(
  yt: YTLanguageCode
): BingTranslateLangCode | undefined {
  // Manual exceptions
  if (yt === 'zh') return 'zh-Hans';
  if (yt === 'no') return 'nb';

  return includes(bingTranslateLangCodes, yt) ? yt : undefined;
}


/**
 * Translate text by making a request to the background script and parsing the
 * response (and dealing with potential errors).
 */
async function translate(translationRequest: TranslatorRequest):
    Promise<string> {
  // Firefox supports usage of the `chrome` object for compatibility reasons.
  try {
    return parseResponse(await chrome.runtime.sendMessage(translationRequest));
  } catch (error) {
    if (String(error).includes('Extension context invalidated')) {
      throw new TranslationConnectionError(
        'The extension was reloaded. Refresh this YouTube page to reconnect.',
      );
    }
    throw error;
  }
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
  lang: YTLanguageCode,
): Promise<string> {
  const word = escapeHTML(sentence[wordIndex]);

  const googleCode = yt2GoogleTranslateCode(lang);
  const bingCode = yt2BingTranslateCode(lang);
  const deepLFromCode = yt2DeepLFromCode(lang);

  const translateHelper = async (text: string, order: Translator[]) => {
    const requests: Partial<Record<Translator, TranslatorRequest>> = {};
    if (googleCode) {
      requests['google'] = {
        text,
        langCodes: {
          from: googleCode,
          to: 'en-GB',
        },
        translator: 'google'
      };
    }
    if (bingCode) {
      requests['bing'] = {
        text,
        langCodes: {
          from: bingCode,
          to: 'en',
        },
        translator: 'bing'
      };
    }
    if (deepLFromCode) {
      requests['deepL'] = {
        text,
        langCodes: {
          from: deepLFromCode,
          to: 'EN',
        },
        translator: 'deepL'
      };
    }
    if (!Object.keys(requests).length) {
      throw new Error(`No suitable translator for language ${lang}!`);
    }
    let failure: unknown;
    for (const translator of order) {
      const request = requests[translator];
      if (!request) continue;
      try {
        return await translate(request);
      } catch (error) {
        if (error instanceof TranslationConnectionError) throw error;
        failure = error;
      }
    }
    throw failure;
  }
  // For out-of-context translation, the least sophisticated translator is
  // usually best.
  const outOfContextTranslationPromise =
    translateHelper(word, ['google', 'bing', 'deepL'])
      // To prevent XSS attacks if the server returns malicious content, we
      // need to sanitize the response.
      .then((translation) => escapeHTML(removePunctuation(translation)));

  const wordWithContext = wrapWordInTags(sentence, wordIndex);
  const inContextTranslationPromise =
    (sentence.length === 1) ?
    // If we are only translating one word, don't send two translation requests.
      outOfContextTranslationPromise :
      translateHelper(wordWithContext, ['deepL', 'bing', 'google'])
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
  const [outOfContextTranslation, inContextTranslation] = await Promise.all([
    outOfContextTranslationPromise, inContextTranslationPromise,
  ]);
  if (outOfContextTranslation.toLowerCase() ===
      inContextTranslation.toLowerCase()) {
    return inContextTranslation;
  } else {
    return '' +
        '<div><div class="translation-annotation">Out of context:</div>' +
        `${outOfContextTranslation.toLowerCase()}</div>` +
        '<div style="height: 0.3em"></div>' +
        '<div><div class="translation-annotation">In context:</div>' +
        `${inContextTranslation}</div>`;
  }
}
