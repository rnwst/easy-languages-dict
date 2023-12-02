'use strict';

import {createElement, easyLangsDictElts} from './utils.js';


/**
 * Create pointer-enterables. These elements contain 'pointerenter' event
 * listeners, which create corresponding translation bubbles.
 * @param {array} words - OCRed words
 * @param {object} screenshotDims - Dims of OCRed screenshot
 */
export function createPointerEnterables(words, screenshotDims) {
  const pointerEnterableContainer =
      easyLangsDictElts('.pointer-enterable-container')[0];

  words.forEach((word, wordIndex) => {
    const pointerEnterable = createElement('pointer-enterable');

    pointerEnterable.style.left =
        `${100 * word.bbox.x0 / screenshotDims.width}%`;
    pointerEnterable.style.top =
        `${100 * word.bbox.y0 / screenshotDims.height}%`;
    pointerEnterable.style.width =
        `${100 * (word.bbox.x1 - word.bbox.x0) / screenshotDims.width}%`;
    pointerEnterable.style.height =
        `${100 * (word.bbox.y1 - word.bbox.y0) / screenshotDims.height}%`;

    pointerEnterable.addEventListener('pointerenter', () => {
      easyLangsDictElts('.translation-bubble-container')[0]
          .dispatchEvent(
              new CustomEvent('translation-request', {
                detail: {
                  words,
                  wordIndex,
                  screenshotDims,
                },
              }),
          );
    });

    pointerEnterableContainer.appendChild(pointerEnterable);
  });
}


/**
 * Remove all pointer-enterables.
 */
export function removePointerEnterables() {
  easyLangsDictElts('.pointer-enterable')
      .forEach((elt) => elt.remove());
}
