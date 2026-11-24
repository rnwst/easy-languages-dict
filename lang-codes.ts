// See https://support.google.com/youtube/answer/7296221
export const ytLanguageCodes = [
  'af',  // Afrikaans
  'sq',  // Albanian
  'am',  // Amharic
  'ar',  // Arabic
  'hy',  // Armenian
  'az',  // Azerbaijani
  'eu',  // Basque
  'be',  // Belarusian
  'bn',  // Bengali
  'bg',  // Bulgarian
  'my',  // Burmese
  'km',  // Central Khmer
  'zh',  // Chinese
  'cs',  // Czech
  'da',  // Danish
  'nl',  // Dutch
  'en',  // English
  'et',  // Estonian
  'fa',  // Farsi (Persian)
  'fil', // Filipino
  'fi',  // Finnish
  'fr',  // French
  'gl',  // Galician
  'ka',  // Georgian
  'de',  // German
  'el',  // Greek
  'gu',  // Gujarati
  'he',  // Hebrew
  'hi',  // Hindi
  'hu',  // Hungarian
  'is',  // Icelandic
  'id',  // Indonesian
  'it',  // Italian
  'ja',  // Japanese
  'jv',  // Javanese
  'kn',  // Kannada
  'ko',  // Korean
  'lo',  // Lao
  'lv',  // Latvian
  'lt',  // Lithuanian
  'mk',  // Macedonian
  'ms',  // Malay
  'ml',  // Malayalam
  'mr',  // Marathi
  'mn',  // Mongolian
  'ne',  // Nepali
  'no',  // Norwegian
  'pl',  // Polish
  'pt',  // Portuguese
  'pa',  // Punjabi
  'ro',  // Romanian
  'ru',  // Russian
  'si',  // Sinhalese (Sinhala)
  'sk',  // Slovak
  'es',  // Spanish
  'su',  // Sundanese
  'sw',  // Swahili
  'sv',  // Swedish
  'ta',  // Tamil
  'te',  // Telugu
  'th',  // Thai
  'tr',  // Turkish
  'uk',  // Ukrainian
  'uz',  // Uzbek
  'vi',  // Vietnamese
  'zu',  // Zulu
] as const;

// See https://developers.deepl.com/docs/getting-started/supported-languages
export const deeplFromLangCodes = [
  'AR', // Arabic
  'BG', // Bulgarian
  'CS', // Czech
  'DA', // Danish
  'DE', // German
  'EL', // Greek
  'EN', // English (all English variants)
  'ES', // Spanish (all Spanish variants)
  'ET', // Estonian
  'FI', // Finnish
  'FR', // French
  'HE', // Hebrew (next-gen models only)
  'HU', // Hungarian
  'ID', // Indonesian
  'IT', // Italian
  'JA', // Japanese
  'KO', // Korean
  'LT', // Lithuanian
  'LV', // Latvian
  'NB', // Norwegian Bokmål
  'NL', // Dutch
  'PL', // Polish
  'PT', // Portuguese (all Portuguese variants)
  'RO', // Romanian
  'RU', // Russian
  'SK', // Slovak
  'SL', // Slovenian
  'SV', // Swedish
  'TH', // Thai (next-gen models only)
  'TR', // Turkish
  'UK', // Ukrainian
  'VI', // Vietnamese (next-gen models only)
  'ZH', // Chinese (all Chinese variants)
] as const;

// See https://developers.deepl.com/docs/getting-started/supported-languages
export const deepLToLangCodes = [
  'AR',      // Arabic
  'BG',      // Bulgarian
  'CS',      // Czech
  'DA',      // Danish
  'DE',      // German
  'EL',      // Greek
  'EN',      // English (unspecified variant; backward compatibility)
  'EN-GB',   // English (British)
  'EN-US',   // English (American)
  'ES',      // Spanish
  'ES-419',  // Spanish (Latin American)
  'ET',      // Estonian
  'FI',      // Finnish
  'FR',      // French
  'HE',      // Hebrew (next-gen models only)
  'HU',      // Hungarian
  'ID',      // Indonesian
  'IT',      // Italian
  'JA',      // Japanese
  'KO',      // Korean
  'LT',      // Lithuanian
  'LV',      // Latvian
  'NB',      // Norwegian Bokmål
  'NL',      // Dutch
  'PL',      // Polish
  'PT',      // Portuguese (unspecified; backward compatibility)
  'PT-BR',   // Portuguese (Brazilian)
  'PT-PT',   // Portuguese (European; non-Brazilian)
  'RO',      // Romanian
  'RU',      // Russian
  'SK',      // Slovak
  'SL',      // Slovenian
  'SV',      // Swedish
  'TH',      // Thai (next-gen models only)
  'TR',      // Turkish
  'UK',      // Ukrainian
  'VI',      // Vietnamese (next-gen models only)
  'ZH',      // Chinese (unspecified; backward compatibility)
  'ZH-HANS', // Chinese (Simplified)
  'ZH-HANT', // Chinese (Traditional);
] as const;

// See https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support
export const bingTranslateLangCodes = [
  'af',       // Afrikaans
  'sq',       // Albanian
  'am',       // Amharic
  'ar',       // Arabic
  'hy',       // Armenian
  'as',       // Assamese
  'az',       // Azerbaijani (Latin)
  'bn',       // Bangla
  'ba',       // Bashkir
  'eu',       // Basque
  'bho',      // Bhojpuri
  'brx',      // Bodo
  'bs',       // Bosnian (Latin)
  'bg',       // Bulgarian
  'yue',      // Cantonese (Traditional)
  'ca',       // Catalan
  'hne',      // Chhattisgarhi
  'lzh',      // Chinese (Literary)
  'zh-Hans',  // Chinese Simplified
  'zh-Hant',  // Chinese Traditional
  'sn',       // chiShona
  'hr',       // Croatian
  'cs',       // Czech
  'da',       // Danish
  'prs',      // Dari
  'dv',       // Divehi
  'doi',      // Dogri
  'nl',       // Dutch
  'en',       // English
  'et',       // Estonian
  'fo',       // Faroese
  'fj',       // Fijian
  'fil',      // Filipino
  'fi',       // Finnish
  'fr',       // French
  'fr-ca',    // French (Canada)
  'gl',       // Galician
  'ka',       // Georgian
  'de',       // German
  'el',       // Greek
  'gu',       // Gujarati
  'ht',       // Haitian Creole
  'ha',       // Hausa
  'he',       // Hebrew
  'hi',       // Hindi
  'mww',      // Hmong Daw (Latin)
  'hu',       // Hungarian
  'is',       // Icelandic
  'ig',       // Igbo
  'id',       // Indonesian
  'ikt',      // Inuinnaqtun
  'iu',       // Inuktitut
  'iu-Latn',  // Inuktitut (Latin)
  'ga',       // Irish
  'it',       // Italian
  'ja',       // Japanese
  'kn',       // Kannada
  'ks',       // Kashmiri
  'kk',       // Kazakh
  'km',       // Khmer
  'rw',       // Kinyarwanda
  'tlh-Latn', // Klingon
  'tlh-Piqd', // Klingon (plqaD)
  'gom',      // Konkani
  'ko',       // Korean
  'ku',       // Kurdish (Central)
  'kmr',      // Kurdish (Northern)
  'ky',       // Kyrgyz (Cyrillic)
  'lo',       // Lao
  'lv',       // Latvian
  'lt',       // Lithuanian
  'ln',       // Lingala
  'dsb',      // Lower Sorbian
  'lug',      // Luganda
  'mk',       // Macedonian
  'mai',      // Maithili
  'mg',       // Malagasy
  'ms',       // Malay (Latin)
  'ml',       // Malayalam
  'mt',       // Maltese
  'mni',      // Manipuri
  'mi',       // Maori
  'mr',       // Marathi
  'mn-Cyrl',  // Mongolian (Cyrillic)
  'mn-Mong',  // Mongolian (Traditional)
  'my',       // Myanmar
  'ne',       // Nepali
  'nb',       // Norwegian Bokmål
  'nya',      // Nyanja
  'or',       // Odia
  'ps',       // Pashto
  'fa',       // Persian
  'pl',       // Polish
  'pt',       // Portuguese (Brazil)
  'pt-pt',    // Portuguese (Portugal)
  'pa',       // Punjabi
  'otq',      // Queretaro Otomi
  'ro',       // Romanian
  'run',      // Rundi
  'ru',       // Russian
  'sm',       // Samoan (Latin)
  'sr-Cyrl',  // Serbian (Cyrillic)
  'sr-Latn',  // Serbian (Latin)
  'st',       // Sesotho
  'nso',      // Sesotho sa Leboa
  'tn',       // Setswana
  'sd',       // Sindhi
  'si',       // Sinhala
  'sk',       // Slovak
  'sl',       // Slovenian
  'so',       // Somali (Arabic)
  'es',       // Spanish
  'sw',       // Swahili (Latin)
  'sv',       // Swedish
  'ty',       // Tahitian
  'ta',       // Tamil
  'tt',       // Tatar (Latin)
  'te',       // Telugu
  'th',       // Thai
  'bo',       // Tibetan
  'ti',       // Tigrinya
  'to',       // Tongan
  'tr',       // Turkish
  'tk',       // Turkmen (Latin)
  'uk',       // Ukrainian
  'hsb',      // Upper Sorbian
  'ur',       // Urdu
  'ug',       // Uyghur (Arabic)
  'uz',       // Uzbek (Latin)
  'vi',       // Vietnamese
  'cy',       // Welsh
  'xh',       // Xhosa
  'yo',       // Yoruba
  'yua',      // Yucatec Maya
  'zu',       // Zulu;
] as const;

// See https://developers.google.com/workspace/admin/directory/v1/languages
export const googleTranslateLangCodes = [
  'am',      // Amharic
  'ar',      // Arabic
  'bg',      // Bulgarian
  'bn',      // Bengali
  'ca',      // Catalan
  'chr',     // Cherokee
  'cs',      // Czech
  'cy',      // Welsh
  'da',      // Danish
  'de',      // German
  'el',      // Greek
  'en-GB',   // English (UK)
  'en-US',   // English (US)
  'es',      // Spanish
  'et',      // Estonian
  'eu',      // Basque
  'fi',      // Finnish
  'fil',     // Filipino
  'fr',      // French
  'gu',      // Gujarati
  'hi',      // Hindi
  'hr',      // Croatian
  'hu',      // Hungarian
  'id',      // Indonesian
  'is',      // Icelandic
  'it',      // Italian
  'iw',      // Hebrew
  'ja',      // Japanese
  'kn',      // Kannada
  'ko',      // Korean
  'lt',      // Lithuanian
  'lv',      // Latvian
  'ml',      // Malayalam
  'mr',      // Marathi
  'ms',      // Malay
  'nl',      // Dutch
  'no',      // Norwegian
  'pl',      // Polish
  'pt-BR',   // Portuguese (Brazil)
  'pt-PT',   // Portuguese (Portugal)
  'ro',      // Romanian
  'ru',      // Russian
  'sk',      // Slovak
  'sl',      // Slovenian
  'sr',      // Serbian
  'sv',      // Swedish
  'sw',      // Swahili
  'ta',      // Tamil
  'te',      // Telugu
  'th',      // Thai
  'tr',      // Turkish
  'uk',      // Ukrainian
  'ur',      // Urdu
  'vi',      // Vietnamese
  'zh-CN',   // Chinese (PRC)
  'zh-TW',   // Chinese (Taiwan)
] as const;
