'use strict';

/**
The functions in this file allow reading of `langs.csv`, which contains
essential information regarding the processing of various languages. This
information is required both in the background as well as content script. There
are several options for providing content scripts (which operate in a restricted
environment) access to a local file, detailed here:
https://discourse.mozilla.org/t/import-a-json-file-to-be-used-in-content-script/19086/3
I've decided on the 'web-accessible-resources' method.
*/


/**
 * Function used to parse `langs.csv`. This function is too simple to parse an
 * arbitrary CSV file (it cannot handle quoted values, carriage return line
 * endings, ...) but it does a good enough job for `langs.csv`.
 * @param {string} csvStr - CSV file contents
 * @return {array} - Array of objects whose keys are equal to the table headers
 */
export function parseCSV(csvStr) {
  const lines = csvStr.split('\n');
  const headers = lines[0].split(',');
  const data = lines.slice(1, -1).map((rowStr) => rowStr.split(','));
  return data.map((row) => {
    const keyValPairs = row.map((val, idx) => [headers[idx], val]);
    return Object.fromEntries(keyValPairs);
  });
}


/**
 * Return information about supported languages and their respective codes.
 * @return {object} - Table row array containing objects with table header keys
 */
export default async function readLangsDotCSV() {
  const url = chrome.runtime.getURL('langs.csv');
  const csvStr = await fetch(url).then((stream) => stream.text());
  return parseCSV(csvStr);
}
