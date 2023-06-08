'use strict';

import {VERT_SUBTITLE_POS} from './config.js';


/**
 * Take screenshot of the portion of the video element containing the text to be
 * OCRed.
 * @param {boolean} downloadScreenshot - Download screenshot for debugging?
 * @return {string} - Data URI in base64 format
 */
export default function takeScreenshot(downloadScreenshot=false) {
  const video = document.querySelector('video');
  const canvas = document.createElement('canvas');
  const canvasContext = canvas.getContext('2d');
  // `Canvas.height` and `.width` are in CSS pixels, whereas `video.videoHeight`
  // and `.videoWidth` are in video source file pixels. By settings the widths
  // equal, we ensure that the two can be used equivalently when calling
  // `canvasContext.drawImage`.
  canvas.height =
      (VERT_SUBTITLE_POS.end - VERT_SUBTITLE_POS.start) * video.videoHeight;
  canvas.width = video.videoWidth;

  // CSS filters are applied to produce black text on white background, which
  // gives best results when performing the OCR.
  canvasContext.filter = 'brightness(60%) contrast(400%) invert() ' +
                         'grayscale(100%) brightness(55%) contrast(1000%)';

  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
  canvasContext.drawImage(
      video,
      0,
      -VERT_SUBTITLE_POS.start * video.videoHeight,
      video.videoWidth,
      video.videoHeight);

  const screenshotBase64 = canvas.toDataURL('image/jpeg');
  canvas.remove();

  if (downloadScreenshot) {
    const link = document.createElement('a');
    document.body.appendChild(link);
    link.href = screenshotBase64;
    link.target = '_self';
    link.fileName = 'image-to-be-OCRed.jpg';
    link.download = true;
    link.click();
  }

  return screenshotBase64;
}
