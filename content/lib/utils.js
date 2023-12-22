'use strict';

import {rewind, fastfwd} from './seek.js';


/**
 * Return a promise which resolves after the timeout. This function enables
 * usage of the following code: `await timeout(timeinMS)`.
 * @param {number} timeInMS - Time in milliseconds after which promise resolves
 * @return {promise} - Promise which resolves after timeout.
 */
export function timeout(timeInMS) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeInMS);
  });
}


/**
 * Determine whether YouTube page is the mobile version.
 * @return {boolean} - Whether YT page is mobile version
 */
export function onMobile() {
  return new URL(document.URL).host.startsWith('m');
}


/**
 * Determine whether YouTube page is the desktop version.
 * @return {boolean} - Whether YT page is desktop version
 */
export function onDesktop() {
  return !onMobile();
}


/**
 * Extract YouTube Video Id from video URL. Example: The video Id of
 * 'https://www.youtube.com/watch?v=x5yPyrpeWjo' is 'x5yPyrpeWjo'.
 * @param {string} videoURL - Video URL
 * @return {string} - Video Id
 */
export function extractVideoId(videoURL) {
  return new URL(videoURL).searchParams.get('v');
}


/**
 * Wait for DOM element to exist, and return the element as soon as it exists.
 * This function is not declared asynchronous because we need the `resolve`
 * function in the callback of the `MutationObserver`.
 * @param {string} selector - DOM node selector
 * @return {object} - Promise resolving to element
 */
export function waitForElt(selector) {
  return new Promise((resolve) => {
    const elt = document.querySelector(selector);
    if (elt) resolve(elt);
    else {
      new MutationObserver((mutations, observer) => {
        const elt = document.querySelector(selector);
        if (elt) {
          observer.disconnect();
          resolve(elt);
        }
      }).observe(document, {childList: true, subtree: true});
    }
  });
}


/**
 * Get YT video element. This function's primary purpose is to avoid duplication
 * of the relevant query selector whenever the video element is needed.
 * @return {object} - YT video element
 */
export function getVideo() {
  // On the mobile app, if autoplay is disabled, the video element is replaced
  // once the video is played. Therefore, we need to wait until the video is
  // playing before returning the video element. Conveniently, the
  // to-be-replaced video element does not have a 'src' attribute, and thus an
  // appropriate query selector is readily constructed.
  return waitForElt(onMobile() ? 'video[src]' : '#movie_player video');
}


/**
 * Get movie player element.
 * @return {object} - Movie player element
 */
export function getMoviePlayer() {
  return waitForElt('#movie_player');
}


/**
 * Create DOM element. All elements created by Easy Languages Dictionary are
 * assigned the class 'easy-languages-dict'. This makes it easier to distinguish
 * them from native YouTube page elements and makes inadvertent interference
 * with the YT page less likely.
 * @param {string} _class - Class to add to element
 * @return {object} - Easy Languages Dict element
 */
export function createElement(_class) {
  const element = document.createElement('div');
  element.classList.add('easy-languages-dict', _class);
  return element;
}


/**
 * Return all DOM elements created by Easy Languages Dictionary to match the
 * specified query selector.
 * @param {string} selector - Query selector
 * @return {array} - Array of matching elements
 */
export function easyLangsDictElts(selector) {
  const elements = document.getElementsByClassName('easy-languages-dict');
  return [].filter.call(elements, (elt) => elt.matches(selector));
}


/**
 * Event handler for 'keydown' event. Intercept arrow keys and rewind or
 * fast-forward the video by 2 seconds instead of the default 5.
 * @param {object} event - Keydown event
 */
function keyEventHandler(event) {
  const key = event.code;
  const rewindKeys = ['ArrowLeft', 'KeyH']; // Make vim users feel at home.
  const fastfwdKeys = ['ArrowRight', 'KeyL'];
  if ((rewindKeys.includes(key) || fastfwdKeys.includes(key)) &&
      // Don't intercept keys when typing comment.
      !document.activeElement.getAttribute('contenteditable') &&
      // Don't intercept keys when typing in search box.
      document.activeElement.tagName != 'INPUT') {
    event.stopPropagation();
    // Prevent page from scrolling horizontally if arrow keys are pressed.
    event.preventDefault();
    rewindKeys.includes(key) ? rewind() : fastfwd();
  }
}


/**
 * Add 'keydown' event listener to intercept arrow keys and rewind or
 * fast-forward the video by 2 seconds instead of the default 5.
 */
export function addRewindFastfwdListener() {
  // Call 'keydown' event handler during capturing phase, on the `document`
  // element. This results in the event handler being called before any of YT's
  // event handlers are called, which are likely bubbling and attached to
  // `document.body`. Capturing and bubbling events are explained here:
  // http://www.quirksmode.org/js/events_order.html
  document.addEventListener('keydown', keyEventHandler, {capture: true});
}


/**
 * Remove 'keydown' event listener. When navigating from an Easy Languages video
 * to a video which is not an Easy Languages video, arrow key presses should
 * result in the video being rewound/fast-forwarded by the default 5 seconds.
 * This necessitates the removal of the event listener.
 */
export function removeRewindFastfwdListener() {
  document.removeEventListener('keydown', keyEventHandler, {capture: true});
}


/**
 * On the mobile YT page, this function prevents the pointer-enterable
 * container's children from being on top of the video controls when they are
 * active.
 * @param {object} pointerEnterableContainer - Pointer-enterable container
 */
export async function
hideBehindActivePlayerControls(pointerEnterableContainer) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(async (mutation) => {
      // Since the pointer-enterable container was inserted before the player
      // controls element, resetting its z-index to 'auto' puts it behind the
      // player controls.
      if (mutation.target.getAttribute('id') === 'player-control-overlay') {
        pointerEnterableContainer.style.zIndex =
            mutation.target.classList.contains('fadein') ? 'auto' : '';
      }
    });
  });
  // We observe the top-level node instead of the player-control-overlay
  // element, which gets removed from the DOM when changing videos. This ensures
  // that the mutation observer is not removed along with the element it
  // observes if it is attached too early when changing videos.
  observer.observe(await waitForElt('#player-control-container'),
      {attributes: true, subtree: true, attributeFilter: ['class']});

  // When the pointer-enterable container is removed from the DOM, the
  // MutationObserver is still going to have a reference to it. To allow the
  // element to be garbage collected, we need to disconnect the observer. To
  // this end, we may redefine the `.remove()` function to first disconnect the
  // observer.
  const oldRemove =
      pointerEnterableContainer.remove.bind(pointerEnterableContainer);
  pointerEnterableContainer.remove = () => {
    observer.disconnect();
    oldRemove();
  };
}


/**
 * Wait for video to be playable.
 * @param {object} video - HTML video element
 * @return {promise} - Whether video is ready to be played
 */
export function waitForPlayable(video) {
  return new Promise((resolve) => {
    if (video.readyState >= 3) resolve();
    else {
      video.addEventListener('canplay', () => {
        resolve();
      }, {once: true});
    }
  });
}


/**
 * Whether or not a word is translatable. Numbers and dashes can't be
 * translated.
 * @param {string} wordText - Word text
 * @return {boolean} - Whether word can be translated
 */
export function isTranslatable(wordText) {
  const isNumeric = (str) => !isNaN(str);
  return !isNumeric(wordText) && wordText != '-';
}


/**
 * Get dimensions of Data URL image.
 * @param {string} dataURL - Data URL
 * @return {object} - Once resolved, object with width and height properties
 */
export function getImageDimensions(dataURL) {
  const image = new Image();
  image.src = dataURL;
  return new Promise((resolve) => {
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
  });
}


/**
 * Check if a promise is resolved or not.
 * @param {promise} promise - Promise to be checked
 * @return {promise} - Resolves to whether promise is resolved
 */
export function isPromiseResolved(promise) {
  const notAPromise = 'unlikely value';
  return Promise.race([promise, notAPromise])
      .then((value) => (value !== notAPromise));
}
