// @ts-check

/**
 * Check for file changes and wait for edits to settle before rebuilding.
 * Finish each build and browser reload before starting the next one.
 * @param {object} options - Watch callbacks
 * @param {() => string} options.snapshot - String used to detect input changes
 * @param {string} options.initial - Inputs built before browser startup
 * @param {() => Promise<void>} options.build - Build into a temporary directory
 * @param {() => Promise<void>} options.publish - Replace built files and reload
 * @param {(error: unknown) => void} options.onError - Report failures
 * @param {number} [options.delay] - Poll/debounce interval in milliseconds
 * @return {() => void} Stop watching
 */
export function watchBuild({snapshot, initial, build, publish, onError,
  delay = 250}) {
  let stopped = false;
  let previous = initial;
  /** @type {string | undefined} */
  let attempted = initial;
  /** @type {ReturnType<typeof setTimeout>} */
  let timer;

  const tick = async () => {
    try {
      const current = snapshot();
      // Wait for two unchanged checks so several file saves trigger one build.
      if (current !== attempted && current === previous) {
        attempted = current;
        await build();
        // If another edit arrived during the build, discard this output and
        // build again rather than load a mixture of old and new code.
        if (!stopped && snapshot() === current) await publish();
        else attempted = undefined;
      }
      previous = current;
    } catch (error) {
      onError(error);
    } finally {
      if (!stopped) timer = setTimeout(tick, delay);
    }
  };
  timer = setTimeout(tick, delay);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * Included only in the development background script. Reloading the extension
 * disconnects its scripts in already-open pages. Refresh YouTube tabs after
 * Chrome reports the new extension is installed, so those scripts reconnect.
 *
 * This also covers first installation: web-ext opens YouTube before installing
 * the extension, so the page may have missed our early-starting script.
 * Refreshing a page does not reinstall the extension, so this cannot loop.
 */
export function refreshDevelopmentTabs() {
  chrome.runtime.onInstalled.addListener(async ({reason}) => {
    if (reason !== 'install' && reason !== 'update') return;
    const tabs = await chrome.tabs.query({
      url: ['https://www.youtube.com/*', 'https://m.youtube.com/*'],
    });
    await Promise.all(tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      try {
        await chrome.tabs.reload(tab.id);
      } catch (error) {
        // A tab can close between the query and reload.
        console.warn('Could not refresh development tab:', error);
      }
    }));
  });
}
