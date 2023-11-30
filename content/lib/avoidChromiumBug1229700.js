'use strict';

import {waitForElt, getMoviePlayer} from './utils.js';


/**
 * On the desktop app, when the video is in default view mode, in Chromium, the
 * translation bubble is suffering from a rendering issue: the `mask-image` is
 * not applied to the `backdrop-filter`. This is due to this Chromium bug:
 * https://bugs.chromium.org/p/chromium/issues/detail?id=1229700. This is
 * because in default view mode, the translation bubble has a relatively
 * positioned ancestor ('#movie_player'). The bug can be avoided by positioning
 * that ancestor statically instead.
 */
export default async function avoidChromiumBug1229700() {
  (await getMoviePlayer()).style.position = 'static';
  // The static positioning of the '#movie_player' element causes the
  // '.ytp-gradient-bottom' element to exceed the bottom rounded corners of the
  // '#ytd-player' element. To avoid this, we set bottom left and right border
  // radii on the '.ytp-gradient-bottom' element.
  const borderRadius =
    getComputedStyle(await waitForElt('#ytd-player')).borderRadius;
  const gradientElt = await waitForElt('.ytp-gradient-bottom');
  gradientElt.style.borderBottomLeftRadius = borderRadius;
  gradientElt.style.borderBottomRightRadius = borderRadius;
}
