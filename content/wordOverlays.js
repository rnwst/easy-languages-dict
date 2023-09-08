'use strict';

import {VERT_SUBTITLE_POS} from './config.js';


/**
 * Create transparent overlay over OCRed word. This element is needed to attach
 * a 'mouseenter' event listener to, so that a translation bubble can be shown
 * above it.
 * @param {object} word - OCRed word
 * @return {object} - Word element
 */
export function createWordOverlay(word) {
  const overlayElt = document.createElement('div');
  // `overlayElt` will become a child of the video container, not the video.
  // This is because video elements can have no children. Unfortunately, this
  // leeds to some positioning challenges, as the video container is not the
  // same size as the video element, when there are black bars at the top and
  // bottom or at the sides.

  // Add 'translation-overlay' class so that elements can be easily removed with
  // a simple simple query selector.
  overlayElt.classList.add('translation-overlay');

  // Make sure elements appear above the video.
  overlayElt.style.zIndex = 12;

  // Draw grey box around word. This is useful for testing purposes, but might
  // become a debug option at some point.
  overlayElt.style.border = '2px solid grey';

  // Position and size overlay.
  overlayElt.style.position = 'absolute';
  const video = document.querySelector('video');
  const container = document.querySelector('#movie_player');
  const positionAndSizeOverlay = () => {
    // `videoWidth/Height` are in CSS pixels, whereas `video.videoWidth/Height`
    // are in 'video pixels'.
    // Position element.
    const [videoWidth, videoHeight] = [video.offsetWidth, video.offsetHeight];
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    const blackBarWidth = (containerWidth - videoWidth) / 2;
    const blackBarHeight = (containerHeight - videoHeight) / 2;
    const left = (word.bbox.x0 / video.videoWidth) * videoWidth + blackBarWidth;
    overlayElt.style.left = left + 'px';
    const top =
        (word.bbox.y0 / video.videoHeight + VERT_SUBTITLE_POS.start) *
        videoHeight +
        blackBarHeight;
    overlayElt.style.top = top + 'px';
    // Size element.
    const width = (word.bbox.x1 - word.bbox.x0) / video.videoWidth * videoWidth;
    overlayElt.style.width = width + 'px';
    const height =
        (word.bbox.y1 - word.bbox.y0) / video.videoHeight * videoHeight;
    overlayElt.style.height = height + 'px';
  };
  positionAndSizeOverlay();

  document.querySelector('div#movie_player').appendChild(overlayElt);

  // Element needs to be repositioned and resized when container is resized.
  new ResizeObserver((entries, observer) => {
    if (document.body.contains(overlayElt)) {
      positionAndSizeOverlay();
    } else {
      observer.disconnect();
    }
  }).observe(container);

  return overlayElt;
}


/**
 * Remove all word overlays.
 */
export function removeWordOverlays() {
  document.querySelectorAll('.translation-overlay')
      .forEach((elt) => elt.remove());
}
