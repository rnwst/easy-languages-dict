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

  const video = document.querySelector('video');

  // This function is needed later if the bubble is resized.
  const fontSize = () => {
    // In CSS pixels rather than 'video pixels'. This is why we can't use
    // `video.videoHeight`.
    const videoHeight = video.offsetHeight;
    // `0.05*videoHeight` is the size of the main text. The English translation
    // below is around 22% smaller.
    return 0.9*0.05*videoHeight;
  };
  bubble.style.fontSize = `${fontSize()}px`;

  // Position bubble.
  bubble.style.position = 'absolute';
  bubble.style.bottom = 'calc(100% + 1.3em)';
  bubble.style.left = '50%';
  const overlayEltMidpoint = overlayElt.offsetLeft + overlayElt.offsetWidth / 2;
  const blackBarWidth = video.offsetLeft;
  const distToLeftVideoEdgeInEM =
      ((overlayEltMidpoint - blackBarWidth) / fontSize()).toPrecision(4);
  const distToRightVideoEdgeInEM =
      ((video.offsetWidth + blackBarWidth - overlayEltMidpoint) / fontSize())
          .toPrecision(4);
  const nearEdgeShift = (offset) => {
    return 'calc(' +
      // Translate to the right if bubble exceeds left video edge (with margin).
      `max(0%,  50% - ${distToLeftVideoEdgeInEM }em + 0.4em + ${offset}) + ` +
      // Translate to the left if bubble exceeds right video edge (with margin).
      `min(0%, -50% + ${distToRightVideoEdgeInEM}em - 0.4em - ${offset})` +
      ')';
  };
  bubble.style.transform =
      `translateX(-50%) translateX(${nearEdgeShift('0px')})`;

  // Fill bubble.
  bubble.innerHTML = translation;

  // Style bubble.
  // This prevents line breaks from being inserted after every word.
  bubble.style.width = 'max-content';
  bubble.style.maxWidth = '9em';
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

  overlayElt.appendChild(bubble);

  // When the video is in default view mode, in Chromium, the translation bubble
  // is suffering from a rendering issue: the `mask-image` is not applied to the
  // `backdrop-filter`. This is due to this Chromium bug:
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1229700.
  // This is because in default view mode, the translation bubble has a
  // relatively positioned ancestor ('#movie_player'). The bug can be avoided by
  // positioning that ancestor statically instead.
  const avoidChromiumBug1229700 = () => {
    document.querySelector('#movie_player').style.position = 'static';
    // The static positioning of the '#movie_player' element causes the
    // '.ytp-gradient-bottom' element to exceed the bottom rounded corners of
    // the '#ytd-player' element. To avoid this, we set bottom left and right
    // border radii on the '.ytp-gradient-bottom' element.
    const borderRadius =
      getComputedStyle(document.querySelector('#ytd-player')).borderRadius;
    const gradientElt = document.querySelector('.ytp-gradient-bottom');
    gradientElt.style.borderBottomLeftRadius = borderRadius;
    gradientElt.style.borderBottomRightRadius = borderRadius;
  };
  avoidChromiumBug1229700();

  // Element needs to be repositioned and resized when container is resized.
  // Above, the 'em' unit is used throughout to position, size, and style.
  // Therefore, we only need to recalculate the font size when the video is
  // resized (and avoid the Chromium bug, since a resizing of the video could
  // mean a change to default view mode).
  new ResizeObserver((entries, observer) => {
    if (document.body.contains(overlayElt)) {
      bubble.style.fontSize = `${fontSize()}px`;
      avoidChromiumBug1229700();
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
