'use strict';

import {createElement} from './utils.js';
import {VERT_SUBTITLE_POS, FONT_SIZE_VIDEO_HEIGHT_FRACTION}
  from './constants.js';


/**
 * Create video overlay element with the same position and dimensions as the
 * portion of the video that was screenshot. This element is automatically
 * resized and repositioned when the video is resized.
 * @param {object} video - YT video element
 * @param {string} _class - Class to be assigned to element
 * @return {object} - Screenshot overlay element
 */
export function createScreenshotOverlay(video, _class) {
  const screenshotOverlay = createElement(_class);

  // `screenshotOverlay` will become a child of the video container, not the
  // video. This is because video elements can have no children. Unfortunately,
  // this leads to some positioning challenges, as the video container is not
  // the same size as the video element when there are black bars at the top and
  // bottom or at the sides.
  const positionOverlay = () => {
    screenshotOverlay.style.left = `${video.offsetLeft}px`;
    screenshotOverlay.style.top =
        `${video.offsetTop + VERT_SUBTITLE_POS.top * video.offsetHeight}px`;
    screenshotOverlay.style.width = `${video.offsetWidth}px`;
    screenshotOverlay.style.height =
        `${(VERT_SUBTITLE_POS.bottom - VERT_SUBTITLE_POS.top) *
           video.offsetHeight}px`;
  };
  positionOverlay();

  const setFontSize = () => {
    screenshotOverlay.style.fontSize =
      `${FONT_SIZE_VIDEO_HEIGHT_FRACTION * video.offsetHeight}px`;
  };
  setFontSize();

  // Element needs to be repositioned and resized when the movie player is
  // resized.
  const observer = new MutationObserver((entries, observer) => {
    positionOverlay();
    setFontSize();
  });
  observer.observe(video, {attributes: true, attributeFilter: ['style']});

  // When the element is removed from the DOM, its MutationObserver is still
  // going to have a reference to it (and will continue to update the element
  // every time the video is resized). To allow the element to be garbage
  // collected, we need to disconnect the observer. To this end, we may redefine
  // the `.remove()` function to first disconnect the observer.
  const oldRemove = screenshotOverlay.remove.bind(screenshotOverlay);
  screenshotOverlay.remove = () => {
    observer.disconnect();
    oldRemove();
  };

  return screenshotOverlay;
}


/**
 * Take screenshot of the portion of the video element containing the text to be
 * OCRed.
 * @param {object} video - YT video element
 * @param {boolean} downloadScreenshot - Download screenshot for debugging?
 * @return {string} - Data URI in base64 format
 */
export function takeScreenshot(video, downloadScreenshot=false) {
  const canvas = document.createElement('canvas');
  const canvasContext = canvas.getContext('2d', {alpha: false});
  // `Canvas.height` and `.width` are in CSS pixels, whereas `video.videoHeight`
  // and `.videoWidth` are in video source file pixels. By settings the widths
  // equal, we ensure that the two can be used equivalently when calling
  // `canvasContext.drawImage`.
  canvas.height =
      (VERT_SUBTITLE_POS.bottom - VERT_SUBTITLE_POS.top) * video.videoHeight;
  canvas.width = video.videoWidth;

  // CSS filters are applied to produce black text on white background, which
  // gives best results when performing the OCR.
  canvasContext.filter = 'brightness(60%) contrast(400%) invert() ' +
                         'grayscale(100%) brightness(55%) contrast(1000%)';

  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
  // Note that `drawImage(video, ...)` doesn't currently work on Firefox on
  // Android, see https://bugzilla.mozilla.org/show_bug.cgi?id=1871437. Until
  // this is fixed, the extension won't work on Android.
  canvasContext.drawImage(
      video,
      0,
      -VERT_SUBTITLE_POS.top * video.videoHeight,
      video.videoWidth,
      video.videoHeight,
  );

  // PNG is the only format that browsers must support.
  const screenshotBase64 = canvas.toDataURL('image/png');
  canvas.remove();

  if (downloadScreenshot) {
    const link = document.createElement('a');
    document.body.appendChild(link);
    link.href = screenshotBase64;
    link.target = '_self';
    link.download = 'image-to-be-OCRed';
    link.click();
  }

  return screenshotBase64;
}
