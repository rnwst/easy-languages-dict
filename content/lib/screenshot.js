'use strict';

import {createElement} from './utils.js';
import {FONT_SIZE_VIDEO_HEIGHT_FRACTION} from './constants.js';


/**
 * Create video overlay element with the same position and dimensions as the
 * portion of the video that was screenshot. This element is automatically
 * resized and repositioned when the video is resized.
 * @param {object} video - YT video element
 * @param {object} subtitlePosition - Subtitle Position
 * @param {string} _class - Class to be assigned to element
 * @return {object} - Screenshot overlay element
 */
export function createScreenshotOverlay(video, subtitlePosition, _class) {
  const screenshotOverlay = createElement(_class);

  // `screenshotOverlay` will become a child of the video container, not the
  // video. This is because video elements can have no children. Unfortunately,
  // this leads to some positioning challenges, as the video container is not
  // the same size as the video element when there are black bars at the top and
  // bottom or at the sides.
  const positionOverlay = () => {
    screenshotOverlay.style.left = `${video.offsetLeft}px`;
    screenshotOverlay.style.top =
        `${video.offsetTop + subtitlePosition.top * video.offsetHeight}px`;
    screenshotOverlay.style.width = `${video.offsetWidth}px`;
    screenshotOverlay.style.height =
        `${(subtitlePosition.bottom - subtitlePosition.top) *
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
 * @param {object} subtitlePosition - Subtitle position
 * @return {object} - Data URI in base64 format
 */
export function takeScreenshots(video, subtitlePosition) {
  const canvas = document.createElement('canvas');
  // The buffer canvas is needed to hold a screenshot in memory, so that
  // different filters can be applied to it. This is because canvas filters need
  // to be applied before `drawImage` is called.
  const bufferCanvas = document.createElement('canvas');
  const canvasCtx = canvas.getContext('2d', {alpha: false});
  const bufferCanvasCtx = bufferCanvas.getContext('2d', {alpha: false});
  // `canvas.height` and `.width` are in CSS pixels, whereas `video.videoHeight`
  // and `.videoWidth` are in video source file pixels. By settings the widths
  // equal, we ensure that the two can be used equivalently when calling
  // `canvasContext.drawImage`.
  canvas.height =
      (subtitlePosition.bottom - subtitlePosition.top) * video.videoHeight;
  bufferCanvas.height = canvas.height;
  canvas.width = video.videoWidth;
  bufferCanvas.width = canvas.width;

  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
  // Note that `drawImage(video, ...)` doesn't currently work on Firefox for
  // Android, see https://bugzilla.mozilla.org/show_bug.cgi?id=1872508. Until
  // this is fixed, the extension won't work on Android.
  bufferCanvasCtx.drawImage(
      video,
      0,
      -subtitlePosition.top * video.videoHeight,
      video.videoWidth,
      video.videoHeight,
  );

  // This CSS filter is used to produce black text on white background, which
  // gives best results when performing the OCR.
  const ocrFilter =
      'brightness(60%) contrast(4) invert() grayscale() brightness(55%) ' +
      'contrast(10)';

  // This CSS filter is used to produce a mask-image for the
  // underline-container, to mask out underlines around descenders. It also
  // produces black text on white background, but adds some blur.
  const descenderMaskFilter =
      'brightness(60%) contrast(9999) grayscale() invert() blur(0.15em) ' +
      'brightness(55%) contrast(5) brightness(2)';

  const getScreenshotBase64 = (filter) => {
    canvasCtx.filter = filter;
    canvasCtx.drawImage(bufferCanvas, 0, 0);
    // PNG is the only format that browsers must support.
    return canvas.toDataURL('image/png');
  };

  const textImage = getScreenshotBase64(ocrFilter);
  const descenderMask = getScreenshotBase64(descenderMaskFilter);

  return {textImage, descenderMask};
}
