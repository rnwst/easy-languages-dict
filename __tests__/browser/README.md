# Opt-in Chromium integration tests

```sh
npm run test-browser
```

Requires a Puppeteer-compatible Chromium executable (its downloaded default,
or `PUPPETEER_EXECUTABLE_PATH=/path/to/chromium`). On a sandbox-restricted CI
runner, explicitly set `CI=1` to pass `--no-sandbox`, including icon conversion.
For example:

```sh
TMPDIR=/tmp/claude/opencode CI=1 \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium npm run test-browser
```

The suite uses `node:test`, not Jest. It builds production and development
extensions once into a fresh directory under `os.tmpdir()` (honoring `TMPDIR`).
All profiles are disposable children of that directory, with Developer mode
enabled for `runtime.reload()`. It never uses `dist/`, `browser-profiles/`, an
existing profile, cookies, or credentials. Browsers close and temporary files
are removed after tests. Builds run from the repository root, as with
`npm run build`. Allow roughly a minute: one test exercises the actual
25-second caption startup deadline.

`BROWSER_HEADFUL=1 npm run test-browser` shows the fixture windows; a display is
required. The default is headless. CDP uses a pipe, not a listening TCP port.

## Coverage and limits

- Actual built MAIN/ISOLATED content scripts, native XHR observation, metadata
  timing/player snapshots, early cached responses, late controls, tokenless
  success, fresh signed context, aborted requests, and late recovery.
- Subtitle timing/seek events, SPA teardown/remount, bubble edges and resize.
- English second-line rendering and graceful handling of its HTTP 429 failure.
- Native CC visibility and trusted mouse/keyboard choices independent of our
  UI, including user changes while caption acquisition is pending.
- Actual runtime translation messaging and Google/DeepL parsing, before and
  after a service-worker `runtime.reload()`, including install after a page is
  already open. Old isolated contexts/DOM must disappear without driver reload.

Every fixture page request is intercepted. Captions/player metadata are local
responses; only service-worker provider **fetch transport** is stubbed, leaving
the extension's message listeners and translator implementations intact. No
live YouTube/provider response is required. The native player factory is absent
(the decoration adapter must fail open); this is not coverage of YouTube's
private player internals, PoToken generation, actual media decoding, or provider
availability. Media timing is driven through real video elements with synthetic
playback events. Production fixtures avoid development install-time refreshes.
Caption acquisition can temporarily toggle the native CC button to obtain a
native response; without user interaction it restores the original setting.
Trusted user choices during acquisition must take precedence over that cleanup.
