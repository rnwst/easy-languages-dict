/**
 * Get data from local storage.
 * Usage of `browser.storage.local` is not possible, because Chromium doesn't
 * support the `browser` object - see https://crbug.com/798169. The Firefox
 * version of this extension uses MV2 (MV3 in Firefox isn't well supported yet.
 * Extensions have no permissions by default, they need to be requested by the
 * user from the extension, which makes MV3 in Firefox untenable). Promise-based
 * APIs were not available in MV2 in Chromium, and so Firefox does not make them
 * available on the `chrome` object in MV2. Therefore, the callback-based APIs
 * need to be used here, so that they work on the `chrome` object both in
 * Firefox MV2 as well as Chromium MV3.
 */
export async function getStoredData(key: string): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (data) => resolve(data[key]));
  });
}


/**
 * Store data in local storage. See notes above regarding use of the
 * callback-based API.
 */
export async function storeData(key: string, data: object): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({[key]: data}, () => resolve());
  });
}


/**
 * Check if a promise is resolved or not.
 */
export async function isPromiseResolved<T>(promise: Promise<T>):
    Promise<boolean> {
  const notAPromise = 'unlikely value';
  return Promise.race([promise, notAPromise])
    .then((value) => (value !== notAPromise));
}
