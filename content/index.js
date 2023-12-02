'use strict';

import {
  timeout,
  onMobile,
  onDesktop,
  extractVideoId,
  waitForElt,
  getVideo,
  getMoviePlayer,
  addRewindFastfwdListener,
  removeRewindFastfwdListener,
  hideBehindActivePlayerControls,
  isTranslatable,
  getImageDimensions,
} from './lib/utils.js';
import getLang from './lib/getLang.js';
import './lib/HTMLMediaElement.playing.js';
import {REST_TIME} from './lib/constants.js';
import {createScreenshotOverlay, takeScreenshot} from './lib/screenshot.js';
import {createUnderlines, removeUnderlines} from './lib/underlines.js';
import {createPointerEnterables, removePointerEnterables}
  from './lib/pointer-enterables.js';
import {createTranslationBubble, removeTranslationBubbles}
  from './lib/translation-bubbles.js';
import translateWord from './lib/translateWord.js';
import avoidChromiumBug1229700 from './lib/avoidChromiumBug1229700.js';


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
  const worker = await createWorker(lang.tesseractCode);

  const video = await getVideo();

  const underlineContainer =
      createScreenshotOverlay(video, 'underline-container');
  const translationBubbleContainer =
      createScreenshotOverlay(video, 'translation-bubble-container');
  const pointerEnterableContainer =
      createScreenshotOverlay(video, 'pointer-enterable-container');

  const moviePlayer = await getMoviePlayer();

  [underlineContainer, translationBubbleContainer].forEach((container) => {
    moviePlayer.appendChild(container);
  });

  if (onDesktop()) {
    moviePlayer.appendChild(pointerEnterableContainer);
  }

  if (onMobile()) {
    // On the mobile page, the subtree of the `#player-control-overlay >
    // ytm-custom-control` element only gets created once the visitor interacts
    // with the video. That subtree appears to be managed by the
    // [incremental-dom](https://github.com/google/incremental-dom/) library. On
    // every update of the DOM, incremental-dom diffs the actual subtree against
    // the virtual DOM and makes appropriate changes. This results in the swift
    // removal of any foreign elements that are inserted here. Therefore, we
    // need to insert the pointer-enterable container at the top level, where it
    // won't be removed.
    const playerContainer = await waitForElt('#player-container-id');
    const player = await waitForElt('#player');
    playerContainer.insertBefore(pointerEnterableContainer, player.nextSibling);

    hideBehindActivePlayerControls(pointerEnterableContainer);
  }

  translationBubbleContainer.addEventListener('translation-request', (evt) => {
    if (document.contains(translationBubbleContainer)) {
      removeTranslationBubbles();
      const {words, wordIndex, screenshotDims} = evt.detail;
      const bubble = createTranslationBubble(words[wordIndex], screenshotDims);
      const sentence = event.detail.words.map((word) => word.text);
      translateWord(sentence, wordIndex, {from: lang.bingCode, to: 'en'})
          .then((translation) => bubble.innerHTML = translation)
          .catch((error) => bubble.textContent = error.message);
    }
  });

  if (onDesktop()) {
    avoidChromiumBug1229700(videoId);
  }

  let previouslyOCRedText = '';
  while (extractVideoId(document.URL) === videoId) {
    if (!video.playing) {
      await timeout(REST_TIME);
    } else {
      const screenshot = takeScreenshot(video);
      const {data} = await worker.recognize(screenshot);
      if (previouslyOCRedText !== data.text) {
        previouslyOCRedText = data.text;

        const words = (data.confidence > 65) ?
            data.words.filter((word) => isTranslatable(word.text)) :
            [];

        const screenshotDims = await getImageDimensions(screenshot);

        removeUnderlines();
        removePointerEnterables();
        removeTranslationBubbles();

        createPointerEnterables(words, screenshotDims);
        createUnderlines(words, screenshotDims);
      }
    }
  }

  // Clean up.
  removeRewindFastfwdListener();
  worker.terminate();
  underlineContainer.remove();
  translationBubbleContainer.remove();
  pointerEnterableContainer.remove();
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
