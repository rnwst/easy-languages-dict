'use strict';

import {rewind, fastfwd} from './seek.js';


/**
 * Return a promise which resolves after the timeout. This function enables
 * usage of the following code: `await timeout(timeinMS)`.
 * @param {number} timeInMS - Time in milliseconds after which promise resolves
 * @return {promise} - Promise which resolves after timeout.
 */
export function timeout(timeInMS) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, timeInMS);
  });
}


/**
 * Determine whether YouTube page is the mobile or desktop version.
 * @return {boolean} - Whether YT page is mobile version
 */
export function isMobile() {
  return new URL(document.URL).host.startsWith('m');
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
    if (elt) return resolve(elt);

    const observer = new MutationObserver((mutations) => {
      const elt = document.querySelector(selector);
      if (elt) {
        observer.disconnect();
        resolve(elt);
      }
    });

    observer.observe(document.body, {childList: true, subtree: true});
  });
}


/**
 * Get YT video element. This function's primary purpose is to avoid duplication
 * of the relevant query selector whenever the video element is needed.
 * @return {object} - YT video element
 */
export function getVideo() {
  const selector = isMobile() ? 'video' : 'ytd-watch-flexy video';
  return waitForElt(selector);
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
 * Add keydown event listener to intercept arrow keys and rewind or fast-forward
 * the video by 2 seconds instead of the default 5.
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
 * Remove keydown event listener. When navigating from an Easy Languages video
 * to a video which is not an Easy Languages video, arrow key presses should
 * result in the video being rewound/fast-forwarded by the default 5 seconds.
 * This necessitates the removal of the event listener.
 */
export function removeRewindFastfwdListener() {
  document.removeEventListener('keydown', keyEventHandler, {capture: true});
}
