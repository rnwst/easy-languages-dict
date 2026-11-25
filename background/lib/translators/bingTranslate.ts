import {BingTranslatorRequest} from '../../../types.js';

/**
Inspired by the `POST` requests made by `bing.com/translator`.
*/


import {getStoredData, storeData} from '../utils.js';


// Promise used to prevent authentication data from being fetched twice if two
// translation requests are made in quick succession. Translation requests
// always come in pairs (out-of-context and in-context translations).
let authDataPromise: Promise<Record<string, string>> | undefined;


/**
 * Obtain authentication data for the Bing Translate API.
 */
async function fetchAuthData(): Promise<Record<string, string>> {
  const authData: Record<string, string> = {};
  const url = 'https://www.bing.com/translator';
  console.debug(`Fetching authentication data from ${url}`);
  const response = await fetch(url);
  if (response.status != 200) {
    throw new Error(
      `Received status code ${response.status} from Bing Translate ` +
      'authentication.'
    );
  }
  const translatePage = await response.text();
  // What all this authorisation data means is anyone's guess. We're just trying
  // to match the requests that are posted when visiting bing.com/translator.
  authData.ig = translatePage.match(/IG:"(.*?)"/)?.[1] ?? '';
  authData.iid = translatePage.match(/data-iid="(.*?)"/)?.[1] ?? '';
  const abusePreventionHelper = JSON.parse(
    translatePage.match(/params_AbusePreventionHelper = (.*?);/)?.[1]
      ??
      '{}');
  authData.token = abusePreventionHelper?.[1];
  authData.key = abusePreventionHelper?.[0];

  if (!authData.ig || !authData.iid || !authData.token || !authData.key) {
    throw new Error('Bing Translate returned no authentication data.');
  }

  return authData;
}


/**
 * Obtain authentication data for the Bing Translate API from storage if it has
 * previously been stored, otherwise fetch authentication data and store it.
 */
async function getAuthData(refresh = false): Promise<Record<string, string>> {
  const authDataStorageKey = 'bingTranslateAuthData';
  let authData = await getStoredData(authDataStorageKey) as
      Record<string, string> | undefined;
  if (!authData || refresh) {
    authData = await fetchAuthData();
    await storeData(authDataStorageKey, authData);
  }
  return authData;
}


/**
 * Send translation request to Bing Translate API and parse response.
 */
async function requestTranslation(
  request: Omit<BingTranslatorRequest, 'translator'>,
  pendingAuth: Promise<Record<string, string>>,
): Promise<string> {
  const authData = await pendingAuth;

  const payload: Record<string, string> = {
    fromLang: request.langCodes.from,
    text: request.text,
    to: request.langCodes.to,
    token: authData.token,
    key: authData.key,
    tryFetchingGenderDebiasedTranslations: 'true',
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
        // PS: These checks appear to have been removed again in Feb 2024.
        // Anyway, it's safest to keep setting the UA for testing.
        'User-agent': navigator.userAgent,
      },
      body: new URLSearchParams(payload),
    },
  );

  if (response.status != 200) {
    throw new Error(
      `Received status code ${response.status} from Bing Translate.`
    );
  }

  const responseData = await response.json();

  // Strangely, the API will return a status code of 200 even if the request was
  // unsuccessful. The actual status code can then be found in the response. If
  // the request is successful, `responseData` has no `statusCode` property.
  const statusCode = responseData?.statusCode || response.status;
  if (statusCode != 200) {
    throw new Error(
      `Received status code ${statusCode} from Bing Translate.\n` +
      `Response data:\n${JSON.stringify(responseData)}`
    );
  }

  const translation = responseData?.[0]?.translations?.[0]?.text;
  if (typeof translation !== 'string' || translation.trim() === '') {
    throw new Error('Bing Translate returned no translation.');
  }
  return translation;
}


/**
 * Translate text with the Bing Translate API.
 */
export default async function bingTranslate(
  request: Omit<BingTranslatorRequest, 'translator'>
): Promise<string> {
  const pendingAuth = authDataPromise ??= getAuthData();

  try {
    return await requestTranslation(request, pendingAuth);
  } catch (error) {
    // Failed authentication must not leave a rejected promise cached forever.
    try {
      await pendingAuth;
    } catch {
      if (authDataPromise === pendingAuth) authDataPromise = undefined;
      throw error;
    }

    // Most likely, the authentication data has expired. Obtain new
    // authentication data, and try one more time. If another instance of this
    // function has already requested new authentication data, don't fetch it
    // again.
    if (!authDataPromise || authDataPromise === pendingAuth) {
      console.warn(`${error}\nUpdating auth data and trying again.`);
      authDataPromise = getAuthData(true);
    }
    const refreshedAuth = authDataPromise!;
    try {
      return await requestTranslation(request, refreshedAuth);
    } catch (retryError) {
      if (authDataPromise === refreshedAuth) authDataPromise = undefined;
      throw retryError;
    }
  }
}
