# Development Notes

## Building the Extension

### Build Script `build.js`

The extension can be built using the build script `build.js`, which is executed by the various `npm` commands in `package.json`. For Chromium, manifest version 3 (MV3) is used, and for Firefox (both desktop and Android versions) MV2 is used. The build script uses [esbuild](https://github.com/evanw/esbuild) for bundling. It also has a 'watch' mode. In this mode, the script launches a browser, watches for changes to the source files, and reloads the updated extension in the browser. This functionality is provided by [web-ext](https://github.com/mozilla/web-ext). This works fine for Chromium, but unfortunately [launching Firefox via web-ext's API is currently broken](https://github.com/mozilla/web-ext/issues/2993), and therefore the command `npm run start-firefox-desktop` does not work. Instead, the following command must be used when testing on Firefox:
```console
npx web-ext run \
  --source-dir=dist/firefox-desktop \
  --target=firefox-desktop \
  --firefox-profile='browser-profiles/firefox-desktop' \
  --keep-profile-changes \
  --start-url='https://www.youtube.com/watch?v=9G9liRZvi5E'
```
Note that the above command does not launch `build.js` and so the extension will not be automatically rebuild if changes to the source files are made. To rebuild the extension in this case, run `npm run build` once the changes are made, and `web-ext` will then automatically update the extension.


### Browser Profiles

When in 'watch' mode, `build.js` launches a browser instance using the browser profile in `browser-profiles/{browser}`. This profile is not version-controlled, and changes to it persist across instances of `npm start`. It is recommended to install a YouTube ad-blocking extension such as uBlock Origin in the profile to improve the developer experience.


## Debugging the Extension

See these [notes on extension debugging](https://extensionworkshop.com/documentation/develop/debugging/).


## Notes on Cross-Browser-Compatibility

### Manifest v2 vs v3

Chrome no longer accepts new extensions using manifest v2 (MV2) at the Chrome Web Store, and therefore MV3 must be used. However, I don't consider Firefox's version of MV3 useable yet. In Firefox's version of MV3, all permissions are optional, and the user is not automatically prompted for those permissions - thus, the extension doesn't work due to a lack of required permissions, and the user is left wondering why. In addition, MV3 is not (yet) supported on Firefox for Android. Therefore, the `manifest.json` in this directory is Chromium-compatible and uses MV3, and the build script `build.js` converts it to MV2 for the Firefox build during the build process.


### Browser Extension APIs

Browser APIs used in extensions differ for every browser. See [WebExtension API support](https://browser.kagi.com/WebExtensions-API-Support.html) for comprehensive documentation. The APIs in Chromium are available on the `chrome` object and not the `browser` object (which does not exist in Chrome), however Firefox supports usage of the `chrome` object for compatibility reasons (see [here](https://github.com/mozilla/webextension-polyfill/issues/329#issuecomment-1188822881) for more information), and therefore it is possible to have a browser-agnostic codebase by using the `chrome` object.
