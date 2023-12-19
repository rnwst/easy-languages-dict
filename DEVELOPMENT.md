# Development Notes

## Browser Profiles

When in 'watch' mode, the build script `build.js` launches a browser instance with the extension loaded. The browser uses a profile in `browser-profiles/...`. This profile is not version-controlled, and may need to be created manually before running `npm start` for the first time. Changes to this browser profile persist across instances of `npm start`. It is recommended to install a YouTube ad-blocking extension such as uBlock Origin in the profile to improve the developer experience.


## Notes on Cross-Browser-Compatibility

### Manifest v2 vs v3

Chrome no longer accepts new extensions using manifest v2 at the Chrome Web Store. Firefox has not implemented MV3 service workers yet (as of August 2023), but [plans to do so](https://blog.mozilla.org/addons/2022/11/17/manifest-v3-signing-available-november-21-on-firefox-nightly/) for compatibility reasons. This makes it impossible to build a cross-browser-compatible extension at this time. Once Firefox has implemented service workers (or Chrome supports background pages, but this doesn't seem like it will happen sadly), cross-compatibility will be possible again. [This](https://www.eff.org/deeplinks/2021/12/googles-manifest-v3-still-hurts-privacy-security-innovation) is an interesting article on Chrome's MV3.


### Browser APIs

Browser APIs used in extensions differ for every browser. This is why [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) exists, but it may only be used for manifest v2. It harmonizes the browser APIs, so that an extension only needs to be written once. In particular, it allows usage of the Promise-based `browser` API available in Firefox. However, Chrome now also supports Promise-based API calls, albeit on the `chrome` object and not the `browser` object (which does not exist in Chrome). However, Firefox supports usage of the `chrome` object for compatibility reasons (see [here](https://github.com/mozilla/webextension-polyfill/issues/329#issuecomment-1188822881) for more information). Therefore, one just has to wait until Firefox also supports service workers for a fully cross-browser-compatible extension. See also [WebExtension API support](https://browser.kagi.com/WebExtensions-API-Support.html).
