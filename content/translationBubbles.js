'use strict';


/**
 * Create translation bubble.
 * @param {object} overlayElt - Overlay element above which to show the bubble
 * @param {string} translation - Translation to be shown in the bubble
 */
export function createTranslationBubble(overlayElt, translation) {
  const bubbleElt = document.createElement('div');
  // Add 'translation-bubble' class so that the bubble can be removed easily
  // with a simple query selector.
  bubbleElt.classList.add('translation-bubble');

  // Position bubble.
  bubbleElt.style.position = 'absolute';
  bubbleElt.style.bottom = '0';
  bubbleElt.style.left = '50%';
  bubbleElt.style.transform = 'translate(-50%, -130%)';
  // Show bubble on top of video.
  bubbleElt.style.zIndex = 12;
  // This prevents linebreaks from being inserted after every word, to avoid
  // overflowing the parent element.
  bubbleElt.style.width = 'max-content';

  // Fill and style bubble.
  bubbleElt.innerHTML = translation;
  // The font used in the Easy Languages videos looks like Tahoma. In the
  // interest of coherent style, the same or a similar font shall be used.
  bubbleElt.style.fontFamily =
      'Tahoma, DejaVu Sans Condensed, sans-serif';
  bubbleElt.style.textAlign = 'center';
  // Off-white text color to match the appearance of the subtitle text.
  bubbleElt.style.color = '#ddd';
  const bubbleOpaqueness = 0.6;
  bubbleElt.style.background = `rgba(0, 0, 0, ${bubbleOpaqueness})`;

  // Dimension bubble.
  const video = document.querySelector('video');
  // In CSS pixels rather than 'video pixels'. This is why we can't use
  // `video.videoHeight`.
  const videoHeight = Number(video.style.height.match(/(.*?)px/)[1]);
  bubbleElt.style.fontSize = `${0.05*videoHeight}px`;
  bubbleElt.style.textShadow =
      `${0.001*videoHeight}px ${0.002*videoHeight}px ` +
      `${0.002*videoHeight}px black`;
  bubbleElt.style.padding =
      `${0.01*videoHeight}px ${0.02*videoHeight}px`;
  bubbleElt.style.borderRadius = `${0.02*videoHeight}px`;

  // Create speech bubble handle.
  const speechBubbleHandle = document.createElement('span');
  bubbleElt.prepend(speechBubbleHandle);
  speechBubbleHandle.style.position = 'absolute';
  const handleWidth = 0.035 * videoHeight;
  speechBubbleHandle.style.left = `calc(50% - ${handleWidth/2}px)`;
  speechBubbleHandle.style.top = '100%';
  // Make border transparent apart from top 'wedge'.
  speechBubbleHandle.style.border = `${handleWidth/2}px solid transparent`;
  speechBubbleHandle.style.borderTopColor =
      `rgba(0, 0, 0, ${bubbleOpaqueness})`;

  // Prevent 'mouseenter' event from firing when entering the bubble -
  // otherwise, hovering over the bubble will make it disappear.
  bubbleElt.style.pointerEvents = 'none';

  overlayElt.appendChild(bubbleElt);
}


/**
 * Remove all translation bubbles.
 */
export function removeTranslationBubbles() {
  document.querySelectorAll('.translation-bubble')
      .forEach((elt) => elt.remove());
}
