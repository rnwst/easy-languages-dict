'use strict';

import getLangData from '../utils/getLangData.js';


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
 * Check if YT video being watched belongs to the Easy Languages channels.
 * @return {boolean} - Whether the video is an Easy Languages video
 */
export async function isEasyLanguagesVideo() {
  // The YT channel element won't be present until YT's JS finishes executing.
  // We repeatedly check if the DOM element exists until it does. Since the
  // extension only runs on URLs corresponding to YT videos (not e.g. channel
  // landing pages or other pages), the query selector should always find a
  // channel element.
  // YT channel names are not unique. Therefore, we need to retrieve the channel
  // URL to make sure the extension doesn't run on a video uploaded by a channel
  // which happens to be named  'Easy {insert language here}' but is
  // unaffiliated with the Easy Languages franchise.
  const findChannelLink = () => {
    return document.querySelector('#above-the-fold .ytd-channel-name a');
  };
  let channelLink = findChannelLink();
  while (!channelLink) {
    await timeout(50);
    channelLink = findChannelLink();
  }
  const channel =
      channelLink.getAttribute('href').match(/^\/@(?<name>.*)$/).groups.name;
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
 * Intercept arrow keys and call event handler to rewind or fast-forward video.
 * @param {function} handler - Function to call to handle
 * rewind/fastfwd
 */
export function addRewindFastfwdListener(handler) {
  const keyEventHandler = (event) => {
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
      const type = rewindKeys.includes(key) ? 'rewind' : 'fastfwd';
      handler(type);
    }
  };
  // Call 'keydown' event handler during capturing phase, on the `document`
  // element. This results in the event handler being called before any of YT's
  // event handlers are called, which are likely bubbling and attached to
  // `document.body`. Capturing and bubbling events are explained here:
  // http://www.quirksmode.org/js/events_order.html
  document.addEventListener('keydown', keyEventHandler, {capture: true});
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
