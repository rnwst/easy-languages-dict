# Development Notes

## Language and subtitle acquisition

Our captions start automatically for videos detected as non-English. Detection prefers audio explicitly labelled as original, followed by audio-track language IDs and unambiguous automatically generated captions. A translated caption being first or default does not identify the spoken language. When multiple manual-caption languages are the only evidence, the extension does not guess. This uses YouTube's information; the extension does not analyse the audio itself.

YouTube's native CC button controls only YouTube's captions; our overlay remains separate and currently has no visibility control. During initial caption acquisition, the extension may briefly enable native captions to obtain their request context, then restore the previous setting. If you interact with CC during that process, your choice takes precedence.

Acquisition waits through ads without spending its timeout or toggling ad captions. Our overlay is hidden during ads and resumes against the content video's media element afterward.

## Script isolation

The browser separates YouTube's JavaScript from the extension's JavaScript. `content/main.ts` runs alongside YouTube's scripts so it can read information held by the player and observe caption downloads. It also enables YouTube's existing wait for caption URL preparation when the required feature is available. This can avoid a request being sent before its access token has been added; it does not guarantee the server will accept every request.

`content/isolated.ts` handles caption parsing, language selection, playback timing, and the interface. The two scripts exchange messages. Video information and successful caption downloads are reused rather than requested a second time. When another track is needed, the extension refers to a saved YouTube request by number; account-related request headers stay private in the page-side script.

Cached English captions and existing English tracks are preferred over auto-translation. Additional requests are not automatically repeated after an empty response or HTTP error, including HTTP 429. Startup recovery can ask the player to prepare another request a limited number of times. If English retrieval fails after source captions have loaded, those source captions and word lookup remain available. Intermittent startup failures with native CC already enabled, and empty responses even with tokens present, remain known limitations.


## Building and Testing the Extension

### Get Started

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

- `npm run type-check` checks source files and tests using the project's TypeScript version. The pre-commit type-check hook uses this command too.
- `npm test` runs Jest. Some tests call live translation services, so it is not an entirely offline suite. The legacy DeepL client is currently rejected by the service; its direct integration tests can fail even though provider fallback is working.
- `npm run test-coverage` runs Jest with coverage reporting.
- `npm run lint` runs ESLint and Stylelint. The current script separates them with `;`, so check both outputs; a successful Stylelint run can hide ESLint's failing exit status. They can also be run separately with `npx --no-install eslint .` and `npx --no-install stylelint '**/*.css'`.
- `npm run test-browser` runs opt-in Chromium integration tests using temporary builds/profiles and locally supplied server responses. See [browser test setup and coverage](./__tests__/browser/README.md).

The automated browser suite currently covers Chromium only. Its successful fixture tests do not establish live YouTube/provider availability or Firefox/Android behavior.


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
