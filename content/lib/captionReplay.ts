const origin = 'EASY_LANGUAGES_DICT_EXT';
const allowed = new Set(['lang', 'kind', 'name', 'tlang', 'fmt']);

/** Fetch another caption track using the headers from a saved YouTube request.
 * This runs on the page's side. Other extension code sends a reference number,
 * so account-related header values never need to be included in page messages.
 */
export function installCaptionReplay(options: {
  root?: Window;
  fetch?: typeof fetch;
} = {}): {remember(id: number, url: string, headers: Headers): void} {
  const root = options.root ?? window;
  const nativeFetch = options.fetch ?? root.fetch;
  const requests = new Map<number, {
    url: string; headers: Headers; expires: number;
  }>();
  const operations = new Map<string, (error: string) => void>();
  const validURL = (address: string): URL | undefined => {
    const url = new URL(address, root.location.href);
    const current = new URL(root.location.href);
    const video = current.searchParams.get('v');
    if (url.origin !== root.location.origin ||
        url.pathname !== '/api/timedtext' || url.username || url.password ||
        !video || url.searchParams.getAll('v').length !== 1 ||
        url.searchParams.get('v') !== video) return;
    return url;
  };
  const send = (operationId: string, status: number, body: string,
    error?: string) => {
    root.postMessage({origin, type: 'CAPTION_REPLAY_RESPONSE',
      content: {operationId, status, body, ...(error ? {error} : {})}},
    root.location.origin);
  };
  const clear = () => {
    requests.clear();
    for (const cancel of operations.values()) {
      cancel('Caption replay cancelled');
    }
  };
  root.addEventListener('pagehide', clear);
  root.addEventListener('yt-navigate-start', clear);
  // Listen on document too: YouTube can announce navigation there rather than
  // on window. Old request details must not be used for the next video.
  root.document?.addEventListener('yt-navigate-start', clear);
  root.addEventListener('message', (event) => {
    if (event.source !== root || event.origin !== root.location.origin ||
        event.data?.origin !== origin) return;
    const {type, content} = event.data;
    if (type !== 'CAPTION_REPLAY_REQUEST' &&
        type !== 'CAPTION_REPLAY_CANCEL') return;
    const operationId = content?.operationId;
    if (typeof operationId !== 'string' || !operationId ||
        operationId.length > 256) return;
    if (type === 'CAPTION_REPLAY_CANCEL') {
      operations.get(operationId)?.('Caption replay cancelled');
      return;
    }
    // Each running download has an ID so it can be cancelled separately. Ignore
    // a duplicate start message while that download is still running.
    if (operations.has(operationId)) return;
    let url: URL;
    let headers: Headers;
    try {
      if (!Number.isSafeInteger(content.requestId)) throw Error();
      const request = requests.get(content.requestId);
      if (!request || request.expires <= Date.now()) {
        requests.delete(content.requestId);
        throw Error();
      }
      const validated = validURL(request.url);
      if (!validated) throw Error();
      url = validated;
      const selection = content.selection;
      if (!selection || typeof selection !== 'object' ||
          Array.isArray(selection)) throw Error();
      // sparams lists the URL values YouTube checks against its signature.
      // Changing those would invalidate the request. Check here too, because
      // scripts on the page can send messages as well as our extension.
      const signed = new Set(url.searchParams.getAll('sparams')
        .flatMap((value) => value.split(',')));
      for (const [key, value] of Object.entries(selection)) {
        if (!allowed.has(key) ||
            (value !== null && typeof value !== 'string')) throw Error();
        const existing = url.searchParams.getAll(key);
        if (signed.has(key)) {
          if (value === null ? existing.length !== 0 :
            existing.length !== 1 || existing[0] !== value) throw Error();
          continue;
        }
        if (value === null) url.searchParams.delete(key);
        else url.searchParams.set(key, value as string);
      }
      headers = new Headers(request.headers);
    } catch {
      send(operationId, 0, '', 'Caption replay request unavailable');
      return;
    }
    const controller = new AbortController();
    let settled = false;
    const finish = (status: number, body: string, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      operations.delete(operationId);
      send(operationId, status, body, error);
    };
    const cancel = (error: string) => {
      finish(0, '', error);
      controller.abort();
    };
    const timer = setTimeout(() => cancel('Caption replay timed out'), 10000);
    operations.set(operationId, cancel);
    void (async () => {
      try {
        const response = await nativeFetch.call(root, url.href, {
          method: 'GET', headers, credentials: 'include', redirect: 'error',
          signal: controller.signal,
        });
        const body = await response.text();
        if (!validURL(url.href)) {
          finish(0, '', 'Caption replay context changed');
        } else finish(response.status, body);
      } catch {
        finish(0, '', 'Caption replay failed');
      }
    })();
  });
  return {
    remember(id, address, sourceHeaders) {
      requests.delete(id);
      try {
        if (!Number.isSafeInteger(id)) return;
        const url = validURL(address);
        if (!url) return;
        const headers = new Headers();
        sourceHeaders.forEach((value, name) => {
          const lower = name.toLowerCase();
          if (lower === 'cookie' || lower === 'cookie2' || lower === 'host' ||
              lower.startsWith('sec-') || lower.startsWith('proxy-')) return;
          headers.append(name, value);
        });
        requests.set(id, {
          url: url.href, headers, expires: Date.now() + 120000,
        });
        if (requests.size > 10) requests.delete(requests.keys().next().value!);
      } catch { /* Unexpected native context must not affect its caller. */ }
    },
  };
}
