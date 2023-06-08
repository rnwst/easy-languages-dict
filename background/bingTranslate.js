'use strict';

/**
The Bing Translate API seems to perform much better than Google Translate at
contextual translation, at least for pl->en. Inspired by the `POST` requests
made by `bing.com/translator`.
*/


/**
 * Authorization data for Bing Translate. Needed to access the API. Kindly
 * supplied by `bing.com/translator`.
 * @type {object}
 */
const authData = {};


/**
 * Obtain authorization data for the Bing Translate API.
 */
async function obtainAuthorizationData() {
  const translatePage = await fetch('https://www.bing.com/translator')
      .then((response) => response.text());
  // What all this authorisation data means is anyone's guess. We're just trying
  // to match the requests that are posted when visiting bing.com/translator.
  authData.ig = translatePage.match(/IG:"(.*?)"/)[1];
  authData.iid = translatePage.match(/data-iid="(.*?)"/)[1];
  const abusePreventionHelper = JSON.parse(
      translatePage.match(/params_AbusePreventionHelper = (.*?);/)[1]);
  authData.token = abusePreventionHelper[1];
  authData.key = abusePreventionHelper[0];
}


/**
 * Send translation request to Bing Translate API and parse response.
 * @param {string} text - Text to be translated
 * @param {object} options - Translation options (languages)
 */
async function requestTranslation(text, options) {
  const payload = {
    fromLang: options.from,
    text,
    to: options.to,
    token: authData.token,
    key: authData.key,
    tryFetchingGenderDebiasedTranslations: true,
  };

  const response = await fetch(
      `https://www.bing.com/ttranslatev3?isVertical=1&&IG=${authData.ig}` +
      `&IID=${authData.iid}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(payload),
      },
  );

  const responseData = await response.json();

  // Strangely, the API will return a status code of 200 even if the request was
  // unsuccessful. The actual status code can then be found in the response. If
  // the request is successful, `responsData` has no `statusCode` poperty.
  const statusCode = responseData.statusCode || response.status;
  if (statusCode != 200) {
    throw new Error(`Received status code ${statusCode} from Bing Translate!`);
  } else {
    return responseData[0].translations[0].text;
  }
}


/**
 * Translate text with the Bing Translate API.
 * @param {string} text - Text to be translated
 * @param {object} options - Translation options (languages)
 * @return {object} - Translation promise resolving to translated string
 */
export default async function bingTranslate(text, options) {
  // When running this function for the first time, authorization data needs to
  // be obtained before sending a translation request.
  if (!Object.keys(authData).length) {
    await obtainAuthorizationData();
  }

  let translation;
  try {
    translation = await requestTranslation(text, options);
  } catch (error) {
    // Most likely, the authorization data has expired. Obtain new authorization
    // data, and try one more time.
    await obtainAuthorizationData();
    translation = await requestTranslation(text, options);
  }

  return translation;
}
