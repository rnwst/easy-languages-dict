/** Listen for messages from our page-side script until the signal is cancelled.
 * Without a signal, keep listening for as long as the page remains open.
 */
export function observeMessages<T>(
  type: string, signal: AbortSignal | undefined, receive: (content: T) => void,
): void {
  signal?.throwIfAborted();
  window.addEventListener('message', (evt) => {
    if (evt.source === window && evt.origin === location.origin &&
        evt.data?.origin === 'EASY_LANGUAGES_DICT_EXT' &&
        evt.data.type === type) receive(evt.data.content);
  }, {signal});
}

/** Wait for a matching message, with a timeout and optional early cancellation.
 * Remove the listener whichever way the wait ends.
 */
export function waitForMessage<T>(
  type: string,
  signal: AbortSignal,
  accept: (content: T) => boolean = () => true,
  timeout = 10000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', listener);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const listener = (evt: MessageEvent) => {
      if (evt.source !== window || evt.origin !== location.origin ||
          evt.data?.origin !== 'EASY_LANGUAGES_DICT_EXT' ||
          evt.data.type !== type) return;
      if (accept(evt.data.content)) {
        cleanup();
        resolve(evt.data.content);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeout);
    window.addEventListener('message', listener);
    signal.addEventListener('abort', abort, {once: true});
  });
}
