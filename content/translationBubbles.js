'use strict';

/**
 * Create translation bubble.
 * @param {object} overlayElt - Overlay element above which to show the bubble
 * @param {string} translation - Translation to be shown in the bubble
 */
export function createTranslationBubble(overlayElt, translation) {
  const bubble = document.createElement('div');
  // Add 'translation-bubble' class so that the bubble can be removed easily
  // with a simple query selector.
  bubble.classList.add('translation-bubble');
  // Position bubble.
  bubble.style.position = 'absolute';
  bubble.style.bottom = 'calc(100% + 1.3em)';
  bubble.style.left = '50%';
  bubble.style.transform = 'translateX(-50%)';
  // Fill bubble.
  bubble.innerHTML = translation;
  bubble.style.maxWidth = '9em';
  // This prevents line breaks from being inserted after every word.
  bubble.style.width = 'max-content';
  // Now style bubble.
  // The lettering used in the Easy Languages videos is something called
  // 'Tahoma' (for stylistic coherence, the same/a similar font is used).
  bubble.style.fontFamily =
      'Tahoma, DejaVu Sans Condensed, sans-serif';
  // Look at that subtle off-white coloring!
  bubble.style.color = '#eee';
  // The tasteful thickness of it!
  bubble.style.textShadow = '0.02em 0.04em 0.04em black';
  // Oh my god! It even has a blurred background!
  bubble.style.backdropFilter = 'blur(0.2em) brightness(43%)';
  // Lighten background so that bubble shape is visible on black background.
  bubble.style.background = 'rgb(255 255 255 / 12%)';
  // Prevent 'mouseenter' event from firing when entering the bubble -
  // otherwise, hovering over the bubble will make it disappear.
  bubble.style.pointerEvents = 'none';

  // Give the bubble its shape.
  // The method used in the following was inspired by
  // https://css-tricks.com/perfect-tooltips-with-css-clipping-and-masking/.
  // The bubble needs to be blurred as a whole, rather than composed of
  // different elements, each of which would be blurred individually. This would
  // cause visual discontinuities between the individual blurred elements.
  // Therefore, the translation bubble is 'cut out' of an initial blurred box,
  // the size of which is determined by padding and content size.
  // First, let's define some CSS custom properties:
  document.documentElement.style.setProperty('--border-radius', '0.5em');
  document.documentElement.style.setProperty('--handle-height', '0.33em');
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
      // 2% blending, to prevent aliasing at the bubble's corners.
      'radial-gradient(closest-side, black 98%, transparent 100%)';
  const linearGradient = 'linear-gradient(black, black)';
  bubble.style.webkitMaskImage =
      Array(4).fill(radialGradient).join(', ') + ', ' + // Corners.
      Array(2).fill(linearGradient).join(', ') + ', ' + // Content.
      'conic-gradient(from -45deg at 50% 100%,' +
      ' black 0deg 90deg, transparent 90deg 360deg)'; // Handle.
  // Percentage values here work differently than length values: the X% point in
  // the gradient/image is aligned with the X% point in the container.
  bubble.style.webkitMaskPosition =
      'left top, ' + // Top left corner.
      'right top, ' + // Top right corner.
      'left 0px bottom var(--handle-height), '+ // Bottom left corner.
      'right 0px bottom var(--handle-height), ' + // Bottom right corner.
      '0 var(--border-radius), ' + // Content.
      'var(--border-radius) 0, ' + // Content.
      'center bottom'; // Handle.
  const radialMaskDim = 'calc(2 * var(--border-radius))';
  const linearMaskDim = `calc(100% - ${radialMaskDim})`;
  bubble.style.webkitMaskSize =
      // Corners.
      Array(4).fill(`${radialMaskDim} ${radialMaskDim}`).join(', ') + ', ' +
      `100% calc(${linearMaskDim} - var(--handle-height)), ` + // Content.
      `${linearMaskDim} calc(100% - var(--handle-height)), ` + // Content.
      // Handle. Oversize slightly to prevent rendering issue of small gap
      // between bubble and handle.
      'calc(2.1 * var(--handle-height) + 2px) calc(1.05 * var(--handle-height)';
  bubble.style.webkitMaskRepeat = 'no-repeat';

  // Above, the 'em' unit is used throughout to position, size, and style.
  // Therefore, we only need to recalculate the font size when the video is
  // resized.
  const setFontSize = () => {
    // In CSS pixels rather than 'video pixels'. This is why we can't use
    // `video.videoHeight`.
    const videoHeight = document.querySelector('video').offsetHeight;
    // `0.05*videoHeight` is the size of the main text. The English translation
    // below is around 22% smaller.
    bubble.style.fontSize = `${0.9*0.05*videoHeight}px`;
  };
  setFontSize();

  overlayElt.appendChild(bubble);

  // Element needs to be repositioned and resized when container is resized.
  new ResizeObserver((entries, observer) => {
    if (document.body.contains(overlayElt)) {
      setFontSize();
    } else {
      observer.disconnect();
    }
  }).observe(overlayElt);
}


/**
 * Remove all translation bubbles. The corresponding ResizeObservers will remove
 * themselves next time they execute.
 */
export function removeTranslationBubbles() {
  document.querySelectorAll('.translation-bubble')
      .forEach((elt) => elt.remove());
}
