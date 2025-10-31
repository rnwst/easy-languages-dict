import {waitForElt, getMoviePlayer} from './utils.js';


/**
 * In Chromium, a bug occurs on the desktop app when the video is in default
 * view mode: the translation bubble's `mask-image` is not applied to the
 * `backdrop-filter`. This is due to this Chromium bug:
 * https://bugs.chromium.org/p/chromium/issues/detail?id=1229700. This is
 * because in default view mode, the translation bubble has a relatively
 * positioned ancestor ('#movie_player'). The bug can be avoided by positioning
 * that ancestor statically instead.
 *
 * In Firefox, a different bug occurs on the desktop app, also in default view
 * mode: the `backdrop-filter` is not applied at all. This is due to this bug:
 * https://bugzilla.mozilla.org/show_bug.cgi?id=1860175. This is because in
 * default view mode, the translation bubble has an ancestor with a
 * border-radius and a non-default overflow value (the '#ytd-player' element).
 * Fortunately, the bug does not occur when the absolutely-positioned
 * translation bubble has a statically positioned ancestor, provided this
 * ancestor is a more direct ancestor than the ancestor with the border-radius
 * and the non-default overflow value. Therefore, the remedy is the same as for
 * the Chromium bug: Position the '#movie_player' element statically!
 */
export default async function avoidBrowserBugs() {
  (await getMoviePlayer()).style.position = 'static';
  // The static positioning of the '#movie_player' element causes the
  // '.ytp-gradient-bottom' and '.ytp-cued-thumbnail-overlay-image' elements to
  // exceed the bottom rounded corners of the '#ytd-player' element. To avoid
  // this, we set border radii on these elements.
  const borderRadius =
    getComputedStyle(await waitForElt('#ytd-player')).borderRadius;
  const gradientElt = await waitForElt<HTMLElement>('.ytp-gradient-bottom');
  gradientElt.style.borderBottomLeftRadius = borderRadius;
  gradientElt.style.borderBottomRightRadius = borderRadius;
  const thumbnail =
      await waitForElt<HTMLElement>('.ytp-cued-thumbnail-overlay-image');
  thumbnail.style.borderRadius = borderRadius;
}
