//@ts-check
'use strict';

import {timeout, getVideo} from './utils.js';


/**
 * Show YT's rewind and fast-forward black circular overlays. This function
 * attempts to duplicate the actions performed by YT's JS when a
 * rewind/fast-forward is performed.
 * @param {string} side - 'back' for rewind or 'forward' for fast-forward
 */
async function showSeekUI(side) {
  /** @type{HTMLElement | null} */
  const seekUIContainer = document.querySelector('.ytp-doubletap-ui-legacy');
  if (seekUIContainer) {
    seekUIContainer.setAttribute('data-side', side);
    seekUIContainer.classList.add('ytp-time-seeking');
    // Make rewind and fastfwd UI video overlay container visible.
    seekUIContainer.style.display = '';
    // Circle diameter is always 110px.
    const diam = '110px';
    // The following relationships were determined by collecting a number of data
    // points and performing a linear regression (which fits perfectly), rather
    // than trying to understand YT's minified JS. Unfortunately, YT's seek UI
    // buttons are placed asymmetrically on the video, with the rewind and
    // fast-forward circles being positioned too far left. For now I've just
    // matched what YT is doing, but I feel the urge to position these overlays
    // symmetrically in a future commit. This will involve calculating the width
    // of the black bars, which is already done when placing the word overlays.
    /** @type{HTMLElement | null} */
    const moviePlayer = document.querySelector('#movie_player');
    if (moviePlayer) {
      const gradient = (side === 'back') ? 0.1 : 0.8;
      const yIntercept = (side === 'back') ? -15 : -30;
      const left = (gradient * moviePlayer.offsetWidth + yIntercept) + 'px';
      const top = (0.5 * moviePlayer.offsetHeight + 15) + 'px';
      /** @type{HTMLElement | null} */
      const seekUICircle = document.querySelector('.ytp-doubletap-static-circle');
      if (seekUICircle) {
        seekUICircle.style.cssText =
            `width: ${diam}; height: ${diam}; left: ${left}; top: ${top};`;
      }
      const seekUILabel = document.querySelector('.ytp-doubletap-tooltip-label');
      if (seekUILabel) seekUILabel.textContent = '2 seconds';
      await timeout(700);
      // Make rewind and fastfwd UI video overlay container invisible again.
      seekUIContainer.style.display = 'none';
    }
  }
}


/**
 * Rewind video by 2 secs. YouTube's default of 5 seconds is too much for
 * language learning.
 */
export async function rewind() {
  const video = await getVideo();
  video.currentTime -= 2;
  showSeekUI('back');
}


/**
 * Fast-forward video by 2 secs. YouTube's default of 5 seconds is too much
 * for language learning.
 */
export async function fastfwd() {
  const video = await getVideo();
  video.currentTime += 2;
  showSeekUI('forward');
}
