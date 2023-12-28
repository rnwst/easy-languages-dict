'use strict';

import * as tesseract from 'tesseract.js';


/**
 * Create Tesseract worker.
 * @param {string} langCode - Tesseract language code
 * @return {promise} - Worker
 */
export default function createOCRWorker(langCode) {
  return tesseract.createWorker(
      langCode,
      // OCR Engine Mode. Options are detailed here:
      // https://github.com/naptha/tesseract.js/blob/master/src/constants/OEM.js.
      // Note that only the LSTM core files are included in the distributable.
      // If a different mode is chosen, adjustments need to be made to
      // `build.js` to ensure that the corresponding files are included.
      1,
      {
      // These files are copied during the build process.by `build.js`.
        workerPath: chrome.runtime.getURL('content/tesseract/worker.min.js'),
        // Path to Tesseract core files. Don't provide a JS file here so that
        // tesseract.js can decide for itself whether it loads the SIMD or
        // non-SIMD version, depending on hardware.
        corePath: chrome.runtime.getURL('content/tesseract-core/'),
        // Download 'traineddata' files over the network.
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      },
  );
}
