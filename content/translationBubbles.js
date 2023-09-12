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
  bubbleElt.style.bottom = '3em';
  bubbleElt.style.left = '50%';
  bubbleElt.style.transform = 'translateX(-50%)';
  // Show bubble on top of video.
  bubbleElt.style.zIndex = 12;
  // This prevents linebreaks from being inserted after every word, to avoid
  // overflowing the parent element.
  bubbleElt.style.width = 'max-content';
  bubbleElt.style.maxWidth = '9em';

  // Fill and style bubble.
  bubbleElt.innerHTML = translation;
  // The font used in the Easy Languages videos looks like Tahoma. In the
  // interest of coherent style, the same or a similar font shall be used.
  bubbleElt.style.fontFamily =
      'Tahoma, DejaVu Sans Condensed, sans-serif';
  // Off-white text color to match the appearance of the subtitle text.
  bubbleElt.style.color = '#ddd';
  const bubbleOpaqueness = 0.6;
  bubbleElt.style.background = `rgba(0, 0, 0, ${bubbleOpaqueness})`;

  // Prevent 'mouseenter' event from firing when entering the bubble -
  // otherwise, hovering over the bubble will make it disappear.
  bubbleElt.style.pointerEvents = 'none';

  // Create speech bubble handle.
  const speechBubbleHandle = document.createElement('span');
  bubbleElt.prepend(speechBubbleHandle);
  speechBubbleHandle.style.position = 'absolute';
  speechBubbleHandle.style.top = '100%';

  // Position and size bubble.
  const video = document.querySelector('video');
  const positionAndSizeBubble = () => {
    // In CSS pixels rather than 'video pixels'. This is why we can't use
    // `video.videoHeight`.
    const videoHeight = video.offsetHeight;
    // `0.05*videoHeight` is the size of the main text. The English translation
    // below is around 22% smaller.
    bubbleElt.style.fontSize = `${0.9*0.05*videoHeight}px`;
    bubbleElt.style.textShadow =
        `${0.001*videoHeight}px ${0.002*videoHeight}px ` +
        `${0.002*videoHeight}px black`;
    bubbleElt.style.padding =
        `${0.01*videoHeight}px ${0.02*videoHeight}px`;
    bubbleElt.style.borderRadius = `${0.02*videoHeight}px`;
    const handleWidth = 0.035 * videoHeight;
    speechBubbleHandle.style.left = `calc(50% - ${handleWidth/2}px)`;
    // Make border of handle element transparent apart from top 'wedge'.
    speechBubbleHandle.style.border = `${handleWidth/2}px solid transparent`;
    speechBubbleHandle.style.borderTopColor =
        `rgba(0, 0, 0, ${bubbleOpaqueness})`;
  };
  positionAndSizeBubble();

  overlayElt.appendChild(bubbleElt);

  // Element needs to be repositioned and resized when container is resized.
  new ResizeObserver((entries, observer) => {
    if (document.body.contains(overlayElt)) {
      positionAndSizeBubble();
    } else {
      observer.disconnect();
    }
  }).observe(overlayElt); // Observe parent rather than video container.
}


/**
 * Remove all translation bubbles. The respective ResizeObservers will remove
 * themselves next time they execute.
 */
export function removeTranslationBubbles() {
  document.querySelectorAll('.translation-bubble')
      .forEach((elt) => elt.remove());
}
