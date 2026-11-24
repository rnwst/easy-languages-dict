import {
  bingTranslateLangCodes,
  deepLToLangCodes,
  deeplFromLangCodes,
  googleTranslateLangCodes,
  ytLanguageCodes
} from './lang-codes.js';

export type JSONSerializable =
  string | number | boolean | null | JSONObject | JSONArray;
type JSONObject = { [key: string]: JSONSerializable };
type JSONArray = Array<JSONSerializable>;

export type YTLanguageCode = (typeof ytLanguageCodes)[number];

export type TranslatorRequest =
  | DeepLTranslatorRequest
  | BingTranslatorRequest
  | GoogleTranslatorRequest

export type DeepLTranslatorRequest = {
  text: string;
  langCodes: {
    from: DeeplFromLangCode;
    to: DeeplToLangCode;
  };
  translator: 'deepL';
};

export type BingTranslatorRequest = {
  text: string;
  langCodes: {
    from: BingTranslateLangCode;
    to: BingTranslateLangCode;
  };
  translator: 'bing';
};

export type GoogleTranslatorRequest = {
  text: string;
  langCodes: {
    from: GoogleTranslateLangCode;
    to: GoogleTranslateLangCode;
  };
  translator: 'google';
};

export type Translator = 'deepL' | 'bing' | 'google';

export type DeeplFromLangCode  = (typeof deeplFromLangCodes)[number];

export type DeeplToLangCode  = (typeof deepLToLangCodes)[number];

export type BingTranslateLangCode = (typeof bingTranslateLangCodes)[number];

export type GoogleTranslateLangCode = (typeof googleTranslateLangCodes)[number];
