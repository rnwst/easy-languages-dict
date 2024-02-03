'use strict';

/**
Inspired by the `POST` requests made by `bing.com/translator`.
*/


import {getStoredData, storeData, isPromiseResolved} from '../utils.js';


// Promise used to prevent authentication data from being fetched twice if two
// translation requests are made in quick succession. Translation requests
// always come in pairs (out-of-context and in-context translations).
let authDataPromise;


/**
 * Obtain authentication data for the Bing Translate API.
 * @return {object} - Authentication data
 */
async function fetchAuthData() {
  const authData = {};
  const url = 'https://www.bing.com/translator';
  console.debug(`Fetching authentication data from ${url}`);
  const translatePage = await fetch(url).then((response) => response.text());
  // What all this authorisation data means is anyone's guess. We're just trying
  // to match the requests that are posted when visiting bing.com/translator.
  authData.ig = translatePage.match(/IG:"(.*?)"/)[1];
  authData.iid = translatePage.match(/data-iid="(.*?)"/)[1];
  const abusePreventionHelper = JSON.parse(
      translatePage.match(/params_AbusePreventionHelper = (.*?);/)[1]);
  authData.token = abusePreventionHelper[1];
  authData.key = abusePreventionHelper[0];

  return authData;
}


/**
 * Obtain authentication data for the Bing Translate API from storage if it has
 * previously been stored, otherwise fetch authentication data and store it.
 * @param {boolean} refresh - Whether to fetch new authentication data
 * @return {object} - Authentication data
 */
async function getAuthData(refresh=false) {
  const authDataStorageKey = 'bingTranslateAuthData';
  let authData = await getStoredData(authDataStorageKey);
  if (!authData || refresh) {
    authData= await fetchAuthData();
    await storeData(authDataStorageKey, authData);
  }
  return authData;
}


/**
 * Send translation request to Bing Translate API and parse response.
 * @param {string} text - Text to be translated
 * @param {object} options - Translation options (languages)
 */
async function requestTranslation(text, options) {
  const authData = await authDataPromise;

  const payload = {
    fromLang: options.from,
    text,
    to: options.to,
    token: authData.token,
    key: authData.key,
    tryFetchingGenderDebiasedTranslations: true,
  };

  const response = await fetch(
      `https://www.bing.com/ttranslatev3?isVertical=1&IG=${authData.ig}` +
      `&IID=${authData.iid}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // The User-agent needs to be set for testing purposes in node, as
          // Bing Translate appears to have introduced UA checks in Jan 2024.
          'User-agent':
              'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) ' +
              'Gecko/20100101 Firefox/123.0',
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
    throw new Error(`Received status code ${statusCode} from Bing Translate.`);
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
  if (!authDataPromise) authDataPromise = getAuthData();

  let translation;
  try {
    translation = await requestTranslation(text, options);
  } catch (error) {
    // Most likely, the authentication data has expired. Obtain new
    // authentication data, and try one more time. If another instance of this
    // function has already requested new authentication data, don't fetch it
    // again.
    if (await isPromiseResolved(authDataPromise)) {
      console.warn(`${error}\nUpdating auth data and trying again.`);
      authDataPromise = getAuthData(true);
    }
    translation = await requestTranslation(text, options);
  }

  return translation;
}
