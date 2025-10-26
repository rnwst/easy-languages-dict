//@ts-check
'use strict';

import {easyLangsDictElts, createElement} from './utils.js';


/**
 * Create underline elements for OCRed words. The purpose of these elements is
 * two-fold: firstly to indicate to the user that a word has been successfully
 * OCRed, and secondly to indicate via a color change that a word has a
 * translation bubble above it.
 * @param {array} words - OCRed words
 * @param {object} screenshotDims - Dimensions of OCRed screenshot
 * @param {string} descenderMask - Mask image to mask out descenders
 */
export function createUnderlines(words, screenshotDims, descenderMask) {
  const underlineContainer = easyLangsDictElts('.underline-container')[0];

  underlineContainer.style.setProperty(
      '--descender-mask',
      `url(${descenderMask})`,
  );

  words.forEach((word) => {
    const underline = createElement('underline');

    underline.style.left = `${100 * word.baseline.x0 / screenshotDims.width}%`;
    underline.style.right =
        `${100 * (1 - word.baseline.x1 / screenshotDims.width)}%`;
    underline.style.top = `${100 * word.baseline.y0 / screenshotDims.height}%`;

    underlineContainer.appendChild(underline);
  });
}


/**
 * Remove all underlines.
 */
export function removeUnderlines() {
  easyLangsDictElts('.underline').forEach((elt) => elt.remove());
}


/**
 * Unilluminate any illuminated underlines (there shouldn't ever be more than
 * one).
 */
export function unilluminateUnderlines() {
  easyLangsDictElts('.underline').forEach((elt) => {
    elt.classList.remove('illuminated');
  });
}


/**
 * @param {number} wordIndex - Index of word whose underline is to be
 * illuminated
 */
export function illuminateUnderline(wordIndex) {
  easyLangsDictElts('.underline')[wordIndex].classList.add('illuminated');
}
