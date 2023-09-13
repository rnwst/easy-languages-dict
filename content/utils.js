'use strict';

import getLangData from '../utils/getLangData.js';
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
 * Check if current page is a YT video belonging to the Easy Languages channels.
 * @return {boolean} - Whether current page is an Easy Languages video
 */
export async function isEasyLanguagesVideo() {
  // First check if current URL corresponds to a YT video. Since this function
  // is only executed once the 'yt-page-data-updated' event is dispatched, the
  // correct channel element is already present in the DOM. YT channel names are
  // not unique. Therefore, we need to retrieve the channel URL to make sure the
  // extension doesn't run on a video uploaded by a channel which happens to be
  // named  'Easy {insert language here}' but is unaffiliated with the Easy
  // Languages franchise.
  if (!document.URL.match(/^https:\/\/www\.youtube\.com\/watch\?v=.*/)) {
    return false;
  }
  // Even though the channelElt should already be loaded, there was an instance
  // where `querySelector` returned `undefined`.
  // TBD: Use `MutationObserver` in case `channelElt` is unavailable.
  const channel = document.querySelector('#above-the-fold .ytd-channel-name a')
      .getAttribute('href').match(/^\/@(?<name>.*)$/).groups.name;
  return (Object.entries(await getLangData())
      .map(([lang, data]) => data.channel).includes(channel) ||
      channel === 'easylanguages'
  );
}


/**
 * Determine language of easy languages video. Assumes that the current video
 * is an Easy Languages video.
 * @return {string} - Language of current video
 */
export function getLang() {
  const videoTitle = document.querySelector(
      '#above-the-fold > #title yt-formatted-string').textContent;
  return videoTitle
      .match(/Easy (?:\w+? )?(?<lang>\w+) \d+/)?.groups.lang.toLowerCase();
}


/**
 * Find out whether Easy Languages video language is supported by Easy Languages
 * Dictionary.
 * @return {boolean} - Whether language is supported
 */
export async function langSupported() {
  const lang = getLang();
  const tesseract = (await getLangData())[lang]?.tesseract;
  return (Boolean(tesseract) && (tesseract != '-'));
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


/**
 * We need to check if the video is playing. There is no `.playing` attribute,
 * but we can define one.
 */
Object.defineProperty(HTMLMediaElement.prototype, 'playing', {
  get: function() {
    return (this.currentTime > 0 &&
            !this.paused &&
            !this.ended &&
            this.readyState > 2);
  },
});
