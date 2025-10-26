//@ts-check
'use strict';

import {
  createElement,
  easyLangsDictElts,
} from './utils.js';


/**
 * Create translation bubble.
 * @param {object} word - Word for which to create translation bubble
 * @param {object} screenshotDims - Dimensions of OCRed screenshot
 * @return {object} - Translation bubble
 */
export function createTranslationBubble(word, screenshotDims) {
  const bubble = createElement('translation-bubble');

  const bubbleContainer = easyLangsDictElts('.translation-bubble-container')[0];

  // Insert bubble into DOM so that `getComputedStyle()` becomes available, but
  // make it invisible until all positioning is complete.
  bubble.style.visibility = 'hidden';
  bubbleContainer.appendChild(bubble);

  // Position bubble.
  const distToLeftVideoEdgeInPc =
      100 * 0.5 * (word.bbox.x0 + word.bbox.x1) / screenshotDims.width;
  const containerPxPerPc = 0.01 * bubbleContainer.offsetWidth;
  const pxPerEm = parseFloat(getComputedStyle(bubble).fontSize);
  const emPerPc = containerPxPerPc / pxPerEm;
  const distToLeftVideoEdgeInEm = distToLeftVideoEdgeInPc * emPerPc;
  const distToRightVideoEdgeInEm = (100 - distToLeftVideoEdgeInPc) * emPerPc;
  // Set CSS custom properties. The positioning is then handled by the
  // injected stylesheet.
  bubble.style.setProperty(
      '--dist-to-left-video-edge',
      distToLeftVideoEdgeInEm.toPrecision(5) + 'em',
  );
  bubble.style.setProperty(
      '--dist-to-right-video-edge',
      distToRightVideoEdgeInEm.toPrecision(5) + 'em',
  );

  // Fill bubble.
  bubble.textContent = 'loading translation...';

  // Now show the bubble.
  bubble.style.visibility = '';

  return bubble;
}


/**
 * Remove all translation bubbles.
 */
export function removeTranslationBubbles() {
  easyLangsDictElts('.translation-bubble').forEach((elt) => elt.remove());
}
