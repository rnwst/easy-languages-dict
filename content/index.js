'use strict';

import translateWord from './translateWord.js';
import takeScreenshot from './takeScreenshot.js';
import {REST_TIME} from './config.js';
import {
  timeout,
  isEasyLanguagesVideo,
  langSupported,
  getLang,
  addRewindFastfwdListener,
  removeRewindFastfwdListener,
} from './utils.js';
import {createWordOverlay, removeWordOverlays} from './wordOverlays.js';
import {createTranslationBubble, removeTranslationBubbles}
  from './translationBubbles.js';
import getLangData from '../utils/getLangData.js';


/**
 * Main function.
 */
async function main() {
  const videoURL = document.URL;
  if (!(await isEasyLanguagesVideo()) || !(await langSupported())) {
    return;
  }

  addRewindFastfwdListener();

  // TBD: Move OCR to background script!
  const {createWorker} = require('tesseract.js');

  const worker = await createWorker();

  const lang = getLang();
  const langData = await getLangData();
  const tesseractCode = langData[lang].tesseract;
  await worker.loadLanguage(tesseractCode);
  await worker.initialize(tesseractCode);

  /**
   * Variable to store text to prevent unnecessary recreation of translation
   * overlay elements.
   * @type {string}
   */
  let previouslyOCRedText = '';

  while (document.URL === videoURL) {
    if (!document.querySelector('video').playing) {
      await timeout(REST_TIME);
    } else {
      const {data} = await worker.recognize(takeScreenshot());
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
          const wordOverlay = createWordOverlay(word);
          wordOverlay.addEventListener('mouseenter', () => {
            removeTranslationBubbles();
            const sentence = words.map((word) => word.text);
            const langCode = langData[lang].bing;
            const translationPromise =
                translateWord(sentence, wordIndex, {from: langCode, to: 'en'});
            translationPromise
                .then((translation) => {
                  createTranslationBubble(wordOverlay, translation);
                }).catch((error) => {
                  createTranslationBubble(wordOverlay, error.message);
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

// See https://stackoverflow.com/a/34100952. The 'yt-navigate-finish' event
// cannot be used, since it is dispatched before e.g. the channel name is
// available (instead, the corresponding query selector returns the channel name
// of the previously watched video, which led to errors that were difficult to
// debug). The 'yt-page-data-updated' event  is dispatched once everything is
// loaded.
document.addEventListener('yt-page-data-updated', main);
