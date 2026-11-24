import {rewind, fastfwd} from './seek.js';


/**
 * Return a promise which resolves after the timeout. This function enables
 * usage of the following code: `await timeout(timeinMS)`.
 */
export function timeout(timeInMS: number): Promise<void> {
  return new Promise((res) => setTimeout(res, timeInMS));
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

/** Use the player's CSS classes to tell whether an ad is on screen. */
export function isAdShowing(): boolean {
  return Boolean(document.querySelector(
    '#movie_player.ad-showing, #movie_player.ad-interrupting, ' +
    '#player-container-id.ad-showing, #player-container-id.ad-interrupting',
  ));
}

/** Notify the caller when ads start or finish, even if the player is replaced.
 * Stop watching when the signal is cancelled.
 */
export function observeAdState(
  receive: (showing: boolean) => void, signal: AbortSignal,
): void {
  signal.throwIfAborted();
  let previous: boolean | undefined;
  const check = () => {
    const showing = isAdShowing();
    if (showing !== previous) {
      previous = showing;
      receive(showing);
    }
  };
  const observer = new MutationObserver(check);
  observer.observe(document, {subtree: true, childList: true,
    attributes: true, attributeFilter: ['class']});
  signal.addEventListener('abort', () => observer.disconnect(), {once: true});
  check();
}

/** Wait for the ad to finish without a time limit. The caller can still cancel
 * the wait, for example when the user switches videos.
 */
export function waitForContent(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!isAdShowing()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const cleanup = () => {
      controller.abort();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, {once: true});
    observeAdState(showing => {
      if (!showing) {
        cleanup();
        resolve();
      }
    }, controller.signal);
  });
}


/**
 * Extract YouTube Video Id from video URL. Example: The video Id of
 * 'https://www.youtube.com/watch?v=x5yPyrpeWjo' is 'x5yPyrpeWjo'.
 */
export function extractVideoId(videoURL: string): VideoId | null {
  return new URL(videoURL).searchParams.get('v');
}


/**
 * Wait for DOM element to exist, and return the element as soon as it exists.
 * This function is not declared asynchronous because we need the `resolve`
 * function in the callback of the `MutationObserver`.
 */
export function waitForElt<T extends Element = Element>(
  selector: string, signal?: AbortSignal, timeout = 15000,
):
    Promise<T> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const check = () => {
      const elt = document.querySelector<T>(selector);
      if (elt) {
        cleanup();
        resolve(elt);
      }
    };
    const observer = new MutationObserver(check);
    const timer = timeout > 0 ? setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout) : undefined;
    observer.observe(document, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['src'],
    });
    signal?.addEventListener('abort', abort, {once: true});
    check();
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
 * Create DOM element. All elements created by YouTube Subtitle Translator are
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
 * Return all DOM elements created by YouTube Subtitle Translator to match the
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
 * Remove our key handler when leaving a video with interactive captions, so
 * arrow keys resume YouTube's default 5-second seeking.
 */
export function removeRewindFastfwdListener(): void {
  document.removeEventListener('keydown', keyEventHandler, {capture: true});
}


/**
 * On the mobile YT page, this function prevents the given container's children
 * from being on top of the video controls when they are active.
 */
export async function
hideBehindActivePlayerControls(container: HTMLElement):
    Promise<void> {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(async (mutation) => {
      // Since the pointer-enterable container was inserted before the player
      // controls element, resetting its z-index to 'auto' puts it behind the
      // player controls.
      if (mutation.target instanceof Element) {
        if (mutation.target.getAttribute('id') === 'player-control-overlay') {
          container.style.zIndex =
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
      container.remove.bind(container);
  container.remove = () => {
    observer.disconnect();
    oldRemove();
  };
}


/**
 * Whether or not a word is translatable. Numbers and dashes can't be
 * translated.
 */
export function isTranslatable(wordText: string): boolean {
  const isNumeric = (str: string) => !isNaN(Number(str));
  return !isNumeric(wordText) && wordText != '-';
}
