<p align="center">
  <img src='./icons/128.svg' width='120px'/>
</p>
<h1 align="center">YouTube Subtitle Translator</h1>
<div align="center">
  <a href="https://chromewebstore.google.com/detail/cclabikdbgmiadcihncalbdchliaambo"><img src='./README-files/chrome-web-store.svg' height='60px' width='225px'/></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/easy-languages-dictionary/polkponobkkpkdjibgiomifmcokdihjl"><img src='./README-files/get-it-from-ms.svg' height='60px' width='190px'/></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/easy-languages-dictionary/"><img src='./README-files/get-the-addon.svg' height='60px' width='195px'/></a>
</div>
<div>&nbsp;</div>
<div align="center">
  <img src="https://img.shields.io/chrome-web-store/v/cclabikdbgmiadcihncalbdchliaambo" />
  <img src="https://img.shields.io/chrome-web-store/rating/cclabikdbgmiadcihncalbdchliaambo" />
  <img src="https://img.shields.io/chrome-web-store/users/cclabikdbgmiadcihncalbdchliaambo" />
  <br>
  <img src="https://img.shields.io/badge/dynamic/json?label=edge%20add-on&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpolkponobkkpkdjibgiomifmcokdihjl" />
  <img src="https://img.shields.io/badge/dynamic/json?label=rating&suffix=/5&query=%24.averageRating&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpolkponobkkpkdjibgiomifmcokdihjl" />
  <img src="https://img.shields.io/badge/dynamic/json?label=users&query=%24.activeInstallCount&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpolkponobkkpkdjibgiomifmcokdihjl" />
  <br>
  <img src="https://img.shields.io/amo/v/easy-languages-dictionary" />
  <img src="https://img.shields.io/amo/rating/easy-languages-dictionary" />
  <img src="https://img.shields.io/amo/users/easy-languages-dictionary" />
</div>
<div>&nbsp;</div>

*YouTube Subtitle Translator* is a browser extension to help you learn spoken languages. It displays YouTube caption tracks as interactive subtitles. Hover over or tap a word to translate it using online translation services. English caption translations appear below the original when YouTube makes them available. Note that YouTube videos must have a usable caption track.

Interactive captions start automatically on YouTube watch pages when a non-English video language can be detected and a matching caption track exists. English-language videos do not start the extension's caption acquisition or overlay; YouTube's own captions remain available. Manually authored captions are preferred over automatic captions. The first line uses the detected source language. Already-captured English captions supply the second line when available; otherwise, an existing English track is fetched directly. YouTube auto-translation is used for translatable tracks only when no English track exists. Word lookups also translate into English.

<img src='./README-files/demo.webp' width='100%' alt='Polish video paused while each subtitle word is hovered to show its English translation.' />*This demonstration shows an excerpt from [this video](https://www.youtube.com/watch?v=Z9PRhksKFqU&t=85s) - © 2026 [Polish with Kamil](https://www.youtube.com/@polishwithkamil).*

This project began as *Easy Languages Dictionary*, an extension that OCRed the subtitles in videos the of Easy Languages YouTube channels, but has since moved on from this.


### Supported browsers

The extension is available for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/easy-languages-dictionary/) and all Chromium-based browsers that support extensions ([Chrome](https://chromewebstore.google.com/detail/cclabikdbgmiadcihncalbdchliaambo), [MS Edge](https://microsoftedge.microsoft.com/addons/detail/easy-languages-dictionary/polkponobkkpkdjibgiomifmcokdihjl), [Opera](https://chromewebstore.google.com/detail/cclabikdbgmiadcihncalbdchliaambo), ...).

The extension is not available for Safari, for the following reasons:
- Publishing a Safari extension requires enrolling in the 'Apple Developer Program', at a cost of 99 $/year, which I have very little appetite for.
- Safari [doesn't support some WebExtension APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation/onHistoryStateUpdated#browser_compatibility) which this extension relies on.


## Tests

Run `npm test` for unit tests or `npm run test-coverage` for coverage. Translator
unit tests use mocked service responses and run in CI. Real-service checks are
opt-in via `npm run test-live`; see the [live translator test guide](./__tests__/background/translators/live/README.md).


## License

© R.&thinsp;N. West, 2023-2024. Released under the [GPL](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) version 2 or greater. This software carries no warranty of any kind. Note that the license only covers the code published in this repository and not any trademarks. If you redistribute the software, modified or unmodified, make sure to change its name and icons so that your derivative cannot be mistaken for the original.
