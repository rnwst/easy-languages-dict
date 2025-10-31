import {rewind, fastfwd} from './seek.js';


/**
 * Return a promise which resolves after the timeout. This function enables
 * usage of the following code: `await timeout(timeinMS)`.
 */
export function timeout(timeInMS: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeInMS);
  });
}


/**
 * Determine whether YouTube page is the mobile version.
 */
export function onMobile(): boolean {
  return new URL(document.URL).host.startsWith('m');
}


/**
 * Determine whether YouTube page is the desktop version.
 */
export function onDesktop(): boolean {
  return !onMobile();
}


/**
 * Extract YouTube Video Id from video URL. Example: The video Id of
 * 'https://www.youtube.com/watch?v=x5yPyrpeWjo' is 'x5yPyrpeWjo'.
 */
export function extractVideoId(videoURL: string): string | null {
  return new URL(videoURL).searchParams.get('v');
}


/**
 * Wait for DOM element to exist, and return the element as soon as it exists.
 * This function is not declared asynchronous because we need the `resolve`
 * function in the callback of the `MutationObserver`.
 */
export function waitForElt<T extends Element = Element>(selector: string):
    Promise<T> {
  return new Promise((resolve) => {
    const elt = document.querySelector<T>(selector);
    if (elt) resolve(elt);
    else {
      new MutationObserver((_, observer) => {
        const elt = document.querySelector<T>(selector);
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
 */
export function getVideo(): Promise<HTMLVideoElement> {
  // On the mobile app, if autoplay is disabled, the video element is replaced
  // once the video is played. Therefore, we need to wait until the video is
  // playing before returning the video element. Conveniently, the
  // to-be-replaced video element does not have a 'src' attribute, and thus an
  // appropriate query selector is readily constructed.
  return waitForElt<HTMLVideoElement>(onMobile() ?
    'video[src]' : '#movie_player video');
}


/**
 * Get movie player element.
 */
export function getMoviePlayer(): Promise<HTMLElement> {
  return waitForElt('#movie_player');
}


/**
 * Create DOM element. All elements created by Easy Languages Dictionary are
 * assigned the class 'easy-languages-dict'. This makes it easier to distinguish
 * them from native YouTube page elements and makes inadvertent interference
 * with the YT page less likely.
 */
export function createElement(_class: string): HTMLDivElement {
  const element = document.createElement('div');
  element.classList.add('easy-languages-dict', _class);
  return element;
}


/**
 * Return all DOM elements created by Easy Languages Dictionary to match the
 * specified query selector.
 */
export function easyLangsDictElts(selector: string): HTMLElement[] {
  const elements = document.getElementsByClassName('easy-languages-dict');
  return [].filter.call(
    elements,
    /** @param{HTMLElement} elt */
    (elt: HTMLElement) => elt.matches(selector)
  );
}


/**
 * Event handler for 'keydown' event. Intercept arrow keys and rewind or
 * fast-forward the video by 2 seconds instead of the default 5.
 */
function keyEventHandler(event: KeyboardEvent) {
  const key = event.code;
  const rewindKeys = ['ArrowLeft', 'KeyH']; // Make vim users feel at home.
  const fastfwdKeys = ['ArrowRight', 'KeyL'];
  if ((rewindKeys.includes(key) || fastfwdKeys.includes(key)) &&
      // Don't intercept keys when typing comment.
      !document.activeElement?.getAttribute('contenteditable') &&
      // Don't intercept keys when typing in search box.
      (document.activeElement as HTMLElement | null)?.tagName != 'INPUT') {
    event.stopPropagation();
    // Prevent page from scrolling horizontally if arrow keys are pressed.
    event.preventDefault();
    if (rewindKeys.includes(key)) {
      rewind();
    } else {
      fastfwd();
    }
  }
}


/**
 * Add 'keydown' event listener to intercept arrow keys and rewind or
 * fast-forward the video by 2 seconds instead of the default 5.
 */
export function addRewindFastfwdListener(): void {
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
export function removeRewindFastfwdListener(): void {
  document.removeEventListener('keydown', keyEventHandler, {capture: true});
}


/**
 * On the mobile YT page, this function prevents the pointer-enterable
 * container's children from being on top of the video controls when they are
 * active.
 */
export async function
hideBehindActivePlayerControls(pointerEnterableContainer: HTMLElement):
    Promise<void> {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(async (mutation) => {
      // Since the pointer-enterable container was inserted before the player
      // controls element, resetting its z-index to 'auto' puts it behind the
      // player controls.
      if (mutation.target instanceof Element) {
        if (mutation.target.getAttribute('id') === 'player-control-overlay') {
          pointerEnterableContainer.style.zIndex =
              mutation.target.classList.contains('fadein') ? 'auto' : '';
        }
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
 */
export function waitForPlayable(video: HTMLVideoElement): Promise<void> {
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
 */
export function isTranslatable(wordText: string): boolean {
  const isNumeric = (str: string) => !isNaN(Number(str));
  return !isNumeric(wordText) && wordText != '-';
}


/**
 * Get dimensions of Data URL image.
 */
export function getImageDimensions(dataURL: string):
    Promise<{ width: number; height: number }> {
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
 */
export async function isPromiseResolved<T>(promise: Promise<T>):
    Promise<boolean> {
  const notAPromise = 'unlikely value';
  return Promise.race([promise, notAPromise])
    .then((value) => (value !== notAPromise));
}
