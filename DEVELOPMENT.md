# Development Notes

## How subtitles work

### Execution contexts

- `content/main.ts` runs alongside YouTube's scripts, reads player metadata, observes caption downloads, and enables waiting for caption URL preparation when supported.
- `content/isolated.ts` handles language selection, parsing, playback timing, and UI.

The scripts exchange messages. Caption replays reference saved requests by ID; account-related request headers remain in the page-side context.

### Caption acquisition

1. Start automatically for non-English videos. Language detection uses YouTube metadata, preferring original-audio labels, then audio-track IDs and unambiguous automatic captions. Default/translated tracks and ambiguous manual-caption languages do not establish the spoken language.
2. Reuse metadata and captions downloaded by YouTube's player (“native captions”), keeping their request context. Native captions have more precise timing.
3. If native downloads repeatedly return empty responses, fail, or time out after 25 seconds excluding ads, use text and timestamps from YouTube's “Show transcript” service to render subtitles instead. This **transcript fallback** runs without opening the panel.
4. Prefer cached English captions and existing English tracks over auto-translation. Transcript fallback retrieves English separately from an existing track.

Startup recovery is bounded. Empty responses and HTTP errors are not automatically replayed. Transcript attempts are limited to one per track per video visit, including retries; HTTP 429 stops further transcript requests for that visit.

Fallback implementation: `content/lib/transcriptPanelBridge.ts` and `content/lib/transcriptPanel.ts`.

### Playback and limitations

- Native CC controls YouTube's captions independently of our overlay, which currently has no visibility control. Acquisition may temporarily enable CC, then restore its previous state; user changes take precedence.
- Ads pause acquisition timeouts and hide the overlay. Playback resumes against the content video's media element; navigation cancels pending work.
- English retrieval failures leave source captions and word lookup usable.
- Known issues include empty HTTP 200 caption responses even with tokens present, and intermittent startup failures with CC already enabled. The transcript service is undocumented; its observed timing is rounded to whole seconds.

See [browser integration tests](#browser-integration-tests) for verification.


## Building and Testing the Extension

### Get Started

Use Node.js 22.22.2+, 24.15.0+, or 26+ (the supported release lines required by the build and lint dependencies).

```console
git clone "https://github.com/rnwst/easy-languages-dict.git"
cd easy-languages-dict
npm install
npm start
```

`npm start` selects Firefox Developer Edition (`deved` in web-ext). Install that edition, or change the `firefox` option in `scripts/build.js` to select another Firefox executable. Use `npm run start-chromium` or `npm run start-edge` for those browsers.


### Build Script `scripts/build.js`

The npm commands in `package.json` run this script. It uses [esbuild](https://github.com/evanw/esbuild) to bundle JavaScript. `npm run build` writes Chromium MV3 files to `dist/chromium`, Firefox MV2 files to `dist/firefox`, and ZIP archives to `dist/`. Edge uses the Chromium output; Firefox desktop and Android use the same Firefox output.

Watch mode launches the browser through [web-ext](https://github.com/mozilla/web-ext). Our watcher groups edits into a complete build in a temporary output directory. Only a successful, up-to-date build replaces the files loaded by the browser. Chromium and Edge development builds then refresh YouTube tabs after extension installation or reload, so existing page scripts reconnect. Production builds do not automatically refresh tabs.

### Checks

- `npm run type-check` checks source files, tests, and the JavaScript build scripts using the project's TypeScript version. The pre-commit type-check hook uses this command too.
- `npm test` runs the mocked Jest suites. `npm run test-live` separately checks the real translation services; availability and rate limits can affect those opt-in tests.
- `npm run test-coverage` runs Jest with coverage reporting.
- `npm run lint` runs ESLint and Stylelint and fails if either check fails.
- `npm run test-browser` runs Chromium and Firefox desktop integration tests using temporary builds/profiles and locally supplied server responses. Append `live` for actual YouTube compatibility checks. See the browser integration section below for setup and coverage.

The browser suites also run in separate Chromium and Firefox CI jobs. Successful fixture tests do not establish live YouTube/provider availability or Android behavior.

TypeScript is pinned to 6.0.3: `typescript-eslint` 8.74 supports TypeScript versions below 6.1, and the build's type-check plugin uses the compiler API removed in TypeScript 7. Upgrade the lint integration and build plugin before moving to TypeScript 7. Other direct dependencies use their latest stable releases as of November 2026.

The scoped `babel-jest` override aligns the legacy syntax plugins' Babel peer requirements with Babel 8. `babel-preset-current-node-syntax` explicitly omits those Babel-7-only plugins when running with Babel 8, but still installs them. Remove the override when that preset's dependencies support Babel 8 directly.


### Browser integration tests

Install compatible browsers and run from the repository root:

```sh
npx puppeteer browsers install chrome
npx puppeteer browsers install firefox
npm run test-browser           # Both browsers
npm run test-browser:chromium
npm run test-browser:firefox
```

Tests run the built extension with disposable profiles and local YouTube/provider responses, covering caption acquisition, translation messaging, UI, and navigation. Default runs do not use live services.


#### Live YouTube mode

``` sh
npm run test-browser live
```

Append `live` to either browser-specific command to select one browser. Live checks validate real YouTube metadata, caption/transcript formats, controls, rendering, and navigation using the same validators as the fixtures. Translation-provider checks remain separate: `npm run test-live`.

- `YT_LIVE_VIDEOS=VIDEO_ID:LANGUAGE,...` overrides the default `Z9PRhksKFqU:pl`. Choose public non-English videos with source and English caption tracks.
- `YT_LIVE_REPORT_DIR` sets the sanitized JSON report directory; the default is `eld-live-reports` under the system temporary directory.

Blocked or unavailable checks are reported as **unverified** and fail the run. YouTube's documented empty caption HTTP 200 responses skip only native-payload validation; transcript fallback, rendering, and navigation must still pass (`pass-with-known-limitations`).

Weekly/manual CI runs fixture and live checks with the latest Chromium snapshot and stable Firefox. Pull-request CI runs fixtures only. Review live failures and update fixtures manually when YouTube changes.

### Desktop Browser Profiles

Watch mode uses these persistent profiles:

| Command | Profile directory |
| --- | --- |
| `npm start` / `npm run start-firefox-desktop` | `browser-profiles/firefox` |
| `npm run start-chromium` | `browser-profiles/chromium` |
| `npm run start-edge` | `browser-profiles/edge` |

Their contents are ignored by Git, and settings/sign-ins persist between launches. Close the browser before another process uses the same profile. Also test with ads enabled: ad timing and replacement of player elements are part of the caption-loading behavior.


### On Android

The current caption-based implementation has not been verified on an Android device. Testing the mobile YouTube page in desktop Firefox is useful, but does not replace a device test.

For local testing:

1. Install Android Platform Tools and put `adb` on your computer's `PATH`. On Arch Linux, the package is [android-tools](https://archlinux.org/packages/extra/x86_64/android-tools/).
2. Enable Android's developer options and USB debugging. Connect the device by USB and authorize the computer when prompted.
3. Install [Firefox Nightly](https://play.google.com/store/apps/details?id=org.mozilla.fenix) on the device. The current script selects its package, `org.mozilla.fenix`; other Firefox editions require changing `firefoxApk` in `scripts/build.js`.
4. Enable **Remote debugging via USB** in Firefox's settings and keep at least one browser tab open.
5. Check `adb devices`, then run `npm run start-firefox-android`. The script currently chooses the first detected ADB device.
6. In desktop Firefox, open `about:debugging`, enable USB devices if necessary, and connect to the device. Allow the incoming connection on Android if prompted. Inspect the relevant tab for page/content-script work, or **Processes → Main Process** for broader extension debugging.

Unlike the disposable browser-test profiles, Android temporary installation uses the device's main Firefox profile. Mozilla recommends matching desktop and Android Firefox versions when debugging problems. See the [current Android development guide](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/).

The manifest's Firefox minimum is **128.0**, needed for its page-side (`MAIN`) content script. [MAIN-world manifest support starts at Firefox 128](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts#world), including Android, so retain at least that minimum when declaring compatibility.

Adding `browser_specific_settings.gecko_android` is **not required for local installation**. It declares Android compatibility to Mozilla's add-on site (AMO). After device testing confirms compatibility, add this property inside the existing `browser_specific_settings` object:

```json
"gecko_android": {}
```

An empty object inherits the existing `gecko` version limits, currently a minimum of 128.0. See [Android distribution compatibility](https://extensionworkshop.com/documentation/publish/version-compatibility/#android-compatibility) and [manifest version settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).


## Debugging the Extension

See these [notes on extension debugging](https://extensionworkshop.com/documentation/develop/debugging/).


## Notes on Cross-Browser-Compatibility

### Manifest v2 vs v3

This project's source manifest uses MV3. The Chromium build uses it with a background service worker; `scripts/build.js` converts the Firefox build to MV2 with a background script that the browser can stop while idle. That describes our current packaging choice, not a lack of MV3 support in Firefox.

Firefox supports MV3 on desktop and Android. Its permissions are not all optional: the important distinction concerns access to websites (**host permissions**). From desktop Firefox 127 onward, the installation prompt lists websites requested through `host_permissions` and `content_scripts`. Users can later revoke that access. See [MDN's host-permission documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions).

Android has additional differences. Mozilla's [Android MV3 guidance](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/#mv3-compatibility) currently recommends MV2 because of host-permission user-interface limitations and lack of background service workers. An MV3 migration of this project's Firefox build would therefore need separate implementation and browser/device testing; changing the manifest version alone is insufficient.


### Browser Extension APIs

This code uses `chrome.*`. Firefox also supports that namespace for compatibility, but a shared name does not guarantee identical API support, callback/promise behavior, or permissions. Check each API's compatibility table and test both browsers. [MDN's Chrome incompatibilities guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) describes the differences; using `chrome.*` by itself does not make the extension browser-independent.
