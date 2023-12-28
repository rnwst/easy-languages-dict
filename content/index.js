'use strict';

import {
  onMobile,
  onDesktop,
  extractVideoId,
  waitForElt,
  getVideo,
  getMoviePlayer,
  addRewindFastfwdListener,
  removeRewindFastfwdListener,
  hideBehindActivePlayerControls,
  waitForPlayable,
  isTranslatable,
  getImageDimensions,
  isPromiseResolved,
} from './lib/utils.js';
import getLang from './lib/getLang.js';
import {createWorker} from 'tesseract.js';
import {createScreenshotOverlay, takeScreenshots} from './lib/screenshot.js';
import {
  createUnderlines,
  removeUnderlines,
  illuminateUnderline,
  unilluminateUnderlines,
} from './lib/underlines.js';
import {createPointerEnterables, removePointerEnterables}
  from './lib/pointer-enterables.js';
import {createTranslationBubble, removeTranslationBubbles}
  from './lib/translation-bubbles.js';
import translateWord from './lib/translateWord.js';
import avoidBrowserBugs from './lib/avoidBrowserBugs.js';


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
  if (videoId != oldVideoId) {
    // This event is needed to terminate any currently running instances of the
    // main function.
    document.dispatchEvent(new CustomEvent('videoId-changed'));
    // If a new video was navigated to, launch main function.
    if (videoId) main(videoId);
  }
});


/**
 * Main function. Executed whenever a new video is loaded.
 */
async function main() {
  const videoId = extractVideoId(document.URL);

  const lang = await getLang(videoId);
  // If the language does not appear in `langs.csv` or if it is unsupported by
  // Tesseract, return.
  if (!lang || (lang.tesseractCode == '-')) return;

  addRewindFastfwdListener();

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
      unilluminateUnderlines();
      const {words, wordIndex, screenshotDims} = evt.detail;
      illuminateUnderline(wordIndex);
      const bubble = createTranslationBubble(words[wordIndex], screenshotDims);
      const sentence = evt.detail.words.map((word) => word.text);
      translateWord(sentence, wordIndex, {from: lang.bingCode, to: 'en'})
          .then((translation) => bubble.innerHTML = translation)
          .catch((error) => bubble.textContent = error.message);
    }
  });

  if (onDesktop()) {
    avoidBrowserBugs();
  }

  // This flag indicates whether the video was paused or seeked while the main
  // loop was executing. If so, another loop iteration should be run to make
  // sure the OCRed text is up-to-date.
  let recentlyPausedOrSeeked = false;

  // Used to prevent overlaid elements from being recreated if the OCRed
  // sentence hasn't changed.
  let previouslyOCRedText;

  const mainLoop = async () => {
    while (videoId === extractVideoId(document.URL) &&
        (!video.paused || recentlyPausedOrSeeked)) {
      recentlyPausedOrSeeked = false;

      await waitForPlayable(video);
      const {textImage, descenderMask} = takeScreenshots(video);
      const {data} = await worker.recognize(textImage);
      if (previouslyOCRedText !== data.text) {
        previouslyOCRedText = data.text;

        const words = (data.confidence > 65) ?
            data.words.filter((word) => isTranslatable(word.text)) :
            [];

        const screenshotDims = await getImageDimensions(textImage);

        removeUnderlines();
        removePointerEnterables();
        removeTranslationBubbles();

        createPointerEnterables(words, screenshotDims);
        createUnderlines(words, screenshotDims, descenderMask);
      }
    }
  };

  // Used to terminate various event listeners.
  const abortController = new AbortController();

  video.addEventListener('pause', () => {
    recentlyPausedOrSeeked = true;
  }, {signal: abortController.signal});

  // Holds the promise returned by the current instance of the async mainLoop
  // function. Used to check if a current instance of mainLoop is already
  // running. Also, before cleaning up, we need to await termination of the
  // current loop as the mainLoop function might still hold references to
  // elements we might otherwise have removed already.
  let currentLoop = mainLoop();

  const runMainLoopIfNotAlreadyRunning = async () => {
    if (await isPromiseResolved(currentLoop)) {
      currentLoop = mainLoop();
    }
  };

  // Perform OCR when the video is seeked, to make sure the recognized text is
  // up-to-date.
  video.addEventListener('seeked', () => {
    recentlyPausedOrSeeked = true;
    runMainLoopIfNotAlreadyRunning();
  }, {signal: abortController.signal});

  video.addEventListener('play', () => {
    runMainLoopIfNotAlreadyRunning();
  }, {signal: abortController.signal});

  const cleanUp = () => {
    abortController.abort();
    removeRewindFastfwdListener();
    worker.terminate();
    underlineContainer.remove();
    translationBubbleContainer.remove();
    pointerEnterableContainer.remove();
  };

  if (videoId === extractVideoId(document.URL)) {
    // Still on the same video!
    document.addEventListener('videoId-changed', async () => {
      await currentLoop;
      cleanUp();
    }, {once: true});
  } else {
    // User already navigated to new page!
    await currentLoop;
    cleanUp();
  }
}
