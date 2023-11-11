# Development Notes

## Parcel

[`parcel`](https://parceljs.org/recipes/web-extension/) is used as a bundler, as content scripts don't currently support ES6 modules (imports could be done [dynamically](https://stackoverflow.com/a/53033388/20803187), but this is messy due to asynchrony, and I also don't know if this would work in `node`, a requirement for testing purposes).


## Notes on Cross-Browser-Compatibility

### Manifest v2 vs v3

Chrome no longer accepts new extensions using manifest v2 at the Chrome Web Store. Firefox has not implemented MV3 service workers yet (as of August 2023), but [plans to do so](https://blog.mozilla.org/addons/2022/11/17/manifest-v3-signing-available-november-21-on-firefox-nightly/) for compatibility reasons. This makes it impossible to build a cross-browser-compatible extension at this time. Once Firefox has implemented service workers (or Chrome supports background pages, but this doesn't seem like it will happen sadly), cross-compatibility will be possible again. [This](https://www.eff.org/deeplinks/2021/12/googles-manifest-v3-still-hurts-privacy-security-innovation) is an interesting article on Chrome's MV3. Support for Firefox's version of MV3 was added in `parcel-bundler` [in this PR](https://github.com/parcel-bundler/parcel/pull/8906). See also [this advice](https://github.com/fregante/browser-extension-template/issues/78#issuecomment-1586121686).


### Browser APIs

Browser APIs used in extensions differ for every browser. This is why [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) exists, but it may only be used for manifest v2. It harmonizes the browser APIs, so that an extension only needs to be written once. In particular, it allows usage of the Promise-based `browser` API available in Firefox. However, Chrome now also supports Promise-based API calls, albeit on the `chrome` object and not the `browser` object (which does not exist in Chrome). However, Firefox supports usage of the `chrome` object for compatibility reasons (see [here](https://github.com/mozilla/webextension-polyfill/issues/329#issuecomment-1188822881) for more information). Therefore, one just has to wait until Firefox also supports service workers for a fully cross-browser-compatible extension. See also [WebExtension API support](https://browser.kagi.com/WebExtensions-API-Support.html).
