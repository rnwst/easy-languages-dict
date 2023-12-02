'use strict';

import {easyLangsDictElts, createElement} from './utils.js';


/**
 * Create underline elements for OCRed words. The purpose of these elements is
 * two-fold: firstly to indicate to the user that a word has been successfully
 * OCRed, and secondly to indicate via a color change that a word has a
 * translation bubble above it.
 * @param {array} words - OCRed words
 * @param {object} screenshotDims - Dimensions of OCRed screenshot
 */
export function createUnderlines(words, screenshotDims) {
  const underlineContainer = easyLangsDictElts('.underline-container')[0];

  words.forEach((word, index) => {
    const underline = createElement('underline');

    underline.style.left = `${100 * word.bbox.x0 / screenshotDims.width}%`;
    underline.style.top = `${100 * word.bbox.y0 / screenshotDims.height}%`;
    underline.style.width =
        `${100 * (word.bbox.x1 - word.bbox.x0) / screenshotDims.width}%`;
    underline.style.height =
        `${100 * (word.bbox.y1 - word.bbox.y0) / screenshotDims.height}%`;

    underlineContainer.appendChild(underline);
  });
}


/**
 * Remove all underlines.
 */
export function removeUnderlines() {
  easyLangsDictElts('.underline').forEach((elt) => elt.remove());
}
