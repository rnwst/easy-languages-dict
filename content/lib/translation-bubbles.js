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
  const bubble = createElement();
  bubble.classList.add('translation-bubble');

  const bubbleContainer = easyLangsDictElts('.translation-bubble-container')[0];

  // Set font size.
  const fontSizeFraction = 0.9; // Relative to the video subtitles.
  bubble.style.fontSize = `${fontSizeFraction}em`;

  // Position bubble.
  bubble.style.position = 'absolute';
  bubble.style.bottom = 'calc(100% + 0.8em)';
  const distToLeftVideoEdgeInPc =
      100 * 0.5 * (word.bbox.x0 + word.bbox.x1) / screenshotDims.width;
  bubble.style.left = `${distToLeftVideoEdgeInPc}%`;
  const containerPxPerEm = parseFloat(
      getComputedStyle(bubbleContainer).getPropertyValue('font-size'),
  );
  const containerPxPerPc = 0.01 * bubbleContainer.offsetWidth;
  const emPerPc = containerPxPerPc / containerPxPerEm / fontSizeFraction;
  const distToLeftVideoEdgeInEm = distToLeftVideoEdgeInPc * emPerPc;
  const distToRightVideoEdgeInEm = (100 - distToLeftVideoEdgeInPc) * emPerPc;
  const nearEdgeShift = (offset) => {
    return 'calc(' +
      // Translate to the right if bubble exceeds left video edge (with margin).
      `max(0%,  50% - ${distToLeftVideoEdgeInEm }em + 0.4em + ${offset}) + ` +
      // Translate to the left if bubble exceeds right video edge (with margin).
      `min(0%, -50% + ${distToRightVideoEdgeInEm}em - 0.4em - ${offset})` +
      ')';
  };
  bubble.style.transform =
      `translateX(-50%) translateX(${nearEdgeShift('0px')})`;

  // Fill bubble.
  bubble.textContent = 'loading translation...';

  // Style bubble.
  // This prevents line breaks from being inserted after every word.
  bubble.style.width = 'max-content';
  bubble.style.maxWidth = '20em';
  // The lettering used in the Easy Languages videos is something called
  // 'Tahoma' (for stylistic coherence, the same/a similar font is used).
  bubble.style.fontFamily =
      'Tahoma, DejaVu Sans Condensed, sans-serif';
  // Look at that subtle off-white coloring!
  bubble.style.color = '#eee';
  // The tasteful thickness of it!
  bubble.style.textShadow = '0.02em 0.04em 0.04em black';
  // Oh my god! It even has a blurred background!
  bubble.style.backdropFilter = 'blur(0.25em) brightness(0.55)';

  // Give the bubble its shape.
  // The method used in the following was inspired by
  // https://css-tricks.com/perfect-tooltips-with-css-clipping-and-masking/.
  // The bubble needs to be blurred as a whole, rather than composed of
  // different elements, each of which would be blurred individually. This would
  // cause visual discontinuities between the individual blurred elements.
  // Therefore, the translation bubble is 'cut out' of an initial blurred box,
  // the size of which is determined by padding and content size.
  // First, let's define some CSS custom properties:
  bubble.style.setProperty('--border-radius', '0.5em');
  bubble.style.setProperty('--handle-height', '0.33em');
  // Padding.
  const horizontalPadding =
      // 0.275em is the minimum expected content width (the letter 'I').
      'calc(var(--border-radius) + var(--handle-height) - 0.275em)';
  bubble.style.paddingLeft = horizontalPadding;
  bubble.style.paddingRight = horizontalPadding;
  bubble.style.paddingTop = '0.35em';
  // Speech bubble handle needs to be 'cut out' from bottom padding.
  bubble.style.paddingBottom = 'calc(0.28em + var(--handle-height))';
  const radialGradient =
      // 1px of blending, to prevent aliasing at the bubble's corners. CSS
      // gradients are not currently anti-aliased by Chromium. See
      // https://bugs.chromium.org/p/chromium/issues/detail?id=408528.
      'radial-gradient(' +
        'closest-side, ' +
        'black calc(100% - 0.5px), ' +
        'transparent calc(100% + 0.5px)' +
      ')';
  const linearGradient = 'linear-gradient(black, black)';
  bubble.style.webkitMaskImage =
      Array(4).fill(radialGradient).join(', ') + ', ' + // Corners.
      Array(2).fill(linearGradient).join(', ') + ', ' + // Content.
      'conic-gradient(' +
        'from -45deg at 50% 100%, ' +
        'black 0deg 90deg, ' +
        'transparent 90deg 360deg' +
      ')'; // Handle.
  // Percentage values here work differently than length values: the X% point in
  // the gradient/image is aligned with the X% point in the container.
  bubble.style.webkitMaskPosition =
      'left top, ' + // Top left corner.
      'right top, ' + // Top right corner.
      'left 0 bottom var(--handle-height), '+ // Bottom left corner.
      'right 0 bottom var(--handle-height), ' + // Bottom right corner.
      '0 var(--border-radius), ' + // Content.
      'var(--border-radius) 0, ' + // Content.
      // To center the handle in case of proximity to a video edge, it needs to
      // be shifted by `var(--handle-height)`.
      `calc(50% - ${nearEdgeShift('var(--handle-height)')}) 100%`; // Handle.
  const radialMaskDim = 'calc(2 * var(--border-radius))';
  const linearMaskDim = `calc(100% - ${radialMaskDim})`;
  bubble.style.webkitMaskSize =
      // Corners.
      Array(4).fill(`${radialMaskDim} ${radialMaskDim}`).join(', ') + ', ' +
      `100% calc(${linearMaskDim} - var(--handle-height)), ` + // Content.
      `${linearMaskDim} calc(100% - var(--handle-height)), ` + // Content.
      // Handle. Oversize slightly to prevent rendering issue of small gap
      // between bubble and handle.
      'calc(2.1 * var(--handle-height)) calc(1.05 * var(--handle-height))';
  bubble.style.webkitMaskRepeat = 'no-repeat';

  bubbleContainer.appendChild(bubble);

  return bubble;
}


/**
 * Remove all translation bubbles.
 */
export function removeTranslationBubbles() {
  easyLangsDictElts('.translation-bubble').forEach((elt) => elt.remove());
}
