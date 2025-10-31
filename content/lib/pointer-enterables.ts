import {createElement, easyLangsDictElts} from './utils.js';


/**
 * Create pointer-enterables. These elements contain 'pointerenter' event
 * listeners, which create corresponding translation bubbles.
 */
export function createPointerEnterables(
  words: Tesseract.Word[],
  screenshotDims: { width: number; height: number },
) {
  const pointerEnterableContainer =
      easyLangsDictElts('.pointer-enterable-container')[0];

  words.forEach((word, wordIndex) => {
    const pointerEnterable = createElement('pointer-enterable');

    pointerEnterable.style.left =
        `${100 * word.bbox.x0 / screenshotDims.width}%`;
    pointerEnterable.style.right =
        `${100 * (1 - word.bbox.x1 / screenshotDims.width)}%`;
    pointerEnterable.style.top =
        `${100 * word.bbox.y0 / screenshotDims.height}%`;
    pointerEnterable.style.bottom =
        `${100 * (1 - word.bbox.y1 / screenshotDims.height)}%`;

    pointerEnterable.addEventListener('pointerenter', () => {
      easyLangsDictElts('.translation-bubble-container')[0]
        .dispatchEvent(
          new CustomEvent('translation-request', {
            detail: {
              words,
              wordIndex,
              screenshotDims,
            },
          }),
        );
    });

    pointerEnterableContainer.appendChild(pointerEnterable);
  });
}


/**
 * Remove all pointer-enterables.
 */
export function removePointerEnterables() {
  easyLangsDictElts('.pointer-enterable')
    .forEach((elt) => elt.remove());
}
