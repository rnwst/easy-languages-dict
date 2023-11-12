'use strict';

import {
  extractVideoId,
  timeout,
  addRewindFastfwdListener,
  removeRewindFastfwdListener,
} from './utils.js';
import getLang from './getLang.js';
import {REST_TIME} from './constants.js';
import takeScreenshot from './takeScreenshot.js';
import {createWordOverlay, removeWordOverlays} from './wordOverlays.js';
import {createTranslationBubble, removeTranslationBubbles}
  from './translationBubbles.js';
import translateWord from './translateWord.js';


/**
 * Main function.
 * @param {string} videoId - YT Video Id
 */
async function main(videoId) {
  const lang = await getLang(videoId);
  // If the language does not appear in `langs.csv` or if it is unsupported by
  // Tesseract, return.
  if (!lang || (lang.tesseractCode == '-')) return;

  addRewindFastfwdListener();

  const {createWorker} = require('tesseract.js');

  const worker = await createWorker();
  await worker.loadLanguage(lang.tesseractCode);
  await worker.initialize(lang.tesseractCode);

  /**
   * Variable to store text to prevent unnecessary recreation of translation
   * overlay elements.
   * @type {string}
   */
  let previouslyOCRedText = '';

  while (extractVideoId(document.URL) === videoId) {
    const video = document.querySelector('video');
    // Conditional chaining is needed since on occasion the video will not yet
    // be present in the DOM when the page is freshly loaded.
    if (!video?.playing) {
      await timeout(REST_TIME);
    } else {
      const {data} = await worker.recognize(takeScreenshot(video));
      // If text is still the same, dont' do anything else.
      if (data.text === previouslyOCRedText) {
        await timeout(REST_TIME);
        continue;
      }
      previouslyOCRedText = data.text;
      removeWordOverlays();
      removeTranslationBubbles();

      if (data.confidence < 65) {
        await timeout(REST_TIME);
        continue;
      }

      const words = data.words;

      // Loop through each OCRed word.
      words.forEach((word, wordIndex) => {
        // Only translate words which aren't numbers or dashes.
        const isNumeric = (str) => !isNaN(str);
        if (!isNumeric(word.text) && word.text != '-') {
          const wordOverlay = createWordOverlay(video, word);
          wordOverlay.addEventListener('mouseenter', () => {
            removeTranslationBubbles();
            const bubble = createTranslationBubble(video, wordOverlay);
            const sentence = words.map((word) => word.text);
            const translationPromise = translateWord(
                sentence,
                wordIndex,
                {from: lang.bingCode, to: 'en'},
            );
            translationPromise
                .then((translation) => {
                  bubble.innerHTML = translation;
                }).catch((error) => {
                  bubble.textContent = error.message;
                });
          });
        }
      });
    }
  }
  // Clean up.
  removeRewindFastfwdListener();
  worker.terminate();
  removeWordOverlays();
}

// YouTube is a single-page app, and updates URLs using `history.pushState`.
// Thus, we need to execute the main function once at the beginning, and
// subsequently everytime the user navigates to a new video.
let videoId = extractVideoId(document.URL);
videoId && main(videoId);
chrome.runtime.onMessage.addListener((message) => {
  // When loading (not navigating to) a URL which corresponds to a playlist,
  // YouTube pushes a history state, even though no page navigation is
  // happening. YT also pushes a history state containing the old URL the first
  // time AJAX navigation is used (and then another history state containing the
  // new URL in quick succession). To avoid executing the main function more
  // than once on the same video, we need to check if the video has actually
  // changed.
  const oldVideoId = videoId;
  videoId = extractVideoId(message.url);
  if (videoId && (videoId != oldVideoId)) {
    main(videoId);
  }
});
