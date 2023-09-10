# Development Notes

## TBD

### High Priority:
- show translations both with and without context
- fix AJAX page navigation
- implement time navigation to sentence beginning by pressing left arrow key
- replace `getLangData()` with a constructor returning an object of class `lang`
- move `tesseract` workers to background to prevent delay when loading video
- implement DeepL translator
- improve test coverage
- move all translation functionality to background script
- if translation error occurs, display error message in small red font
- use default translation engine instead of Bing Translate
- write script to produce colored table for README showing languages inside `<foreignObject>`
- add icon (in multiple sizes)
- fix strict mode
- work on cross-browser compatibility (Safari, Firefox)
- investigate if disabling of service workers due to inactivity has an effect on caching of translations
- get rid of parcel and implement an auto-reload that actually works to make development easier

### Low Priority:
- OCR when seeking and pausing video
- fix word dimensions to make hovering easier
- reduce CPU load by computing image correlation before OCRing
- implement extension menu option for choosing translation engine
- implement Yandex Translate
- allow translation to language other than English with corresponding menu option
- for Easy English Channel, display whole sentence translation in chosen language underneath English subtitles
- implement extension menu option for debugging
- if debug option is enabled, provide button on page to save image to be OCRed
- display statistics about time spent learning languages and number of words looked up to user


## Parcel

[`parcel`](https://parceljs.org/recipes/web-extension/) is used as a bundler, as content scripts don't currently support ES6 modules. `parcel` doesn't seem to preserve strict mode when bundling scripts, and it's auto reload feature works less than a third of the time. The alternative is to use [dynamic imports](https://stackoverflow.com/a/53033388/20803187), but this is messy due to their asynchronous nature, and I also don't know if this would work in `node`, a requirement for testing purposes. Since `tesseract` will soon be moved to the background script, no imports will be needed anymore in the content script, and all relevant content files can be assembled into `./content/index.js`. `parcel` will then no longer be needed and can be removed from the project.


## Notes on Cross-Browser-Compatibility

### Manifest v2 vs v3

Chrome no longer accepts new extensions using manifest v2 at the Chrome Web Store. Firefox has not implemented MV3 service workers yet (as of August 2023), but [plans to do so](https://blog.mozilla.org/addons/2022/11/17/manifest-v3-signing-available-november-21-on-firefox-nightly/) for compatibility reasons. This makes it impossible to build a cross-browser-compatible extension at this time. Once Firefox has implemented service workers (or Chrome supports background pages, but this doesn't seem like it will happen sadly), cross-compatibility will be possible again. [This](https://www.eff.org/deeplinks/2021/12/googles-manifest-v3-still-hurts-privacy-security-innovation) is an interesting article on Chrome's MV3. As a side note, `parcel-bundler` currently does not support Firefox's vision of MV3 (it expects a `service_worker` field in `manifest.json`, see [here](https://github.com/parcel-bundler/parcel/issues/8785)).


### A note on browser APIs

Browser APIs used in extensions differ for every browser. This is why [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) exists, but it may only be used for manifest v2. It harmonizes the browser APIs, so that an extension only needs to be written once. In particular, it allows usage of the Promise-based `browser` API available in Firefox. However, Chrome now also supports Promise-based API calls, albeit on the `chrome` object and not the `browser` object (which does not exist in Chrome). However, Firefox supports usage of the `chrome` object for compatibility reasons (see [here](https://github.com/mozilla/webextension-polyfill/issues/329#issuecomment-1188822881) for more detail). Therefore, one just has to wait until Firefox also supports service workers for a cross-browser-compatible extension.
