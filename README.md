<p align="center">
  <img src='./icons/128.svg' width='120px'/>
</p>
<h1 align="center">Easy Languages Dictionary</h1>
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

*Easy Languages Dictionary* is a browser extension to help you learn spoken languages. It provides translations of individual words in the subtitles of videos published by any of the [*Easy Languages* YouTube channels](https://www.youtube.com/@easylanguages/playlists). It recognizes the words in the subtitles using [Tesseract](https://github.com/naptha/tesseract.js/) and translates them using various online translation services.

<img src='./README-files/demo.webp' width='100%' />*This demonstration shows an excerpt from [this video](https://www.youtube.com/watch?v=prYx-rYtKgc) - © 2023 [Easy Polish YouTube Channel](https://www.youtube.com/@EasyPolish).*

While I am unaffiliated with the Easy Languages franchise and this extension is an entirely separate project, it would have no value without the great work done by the people running the Easy Languages channels. **Please consider supporting the channels on Patreon if you find their work useful!**


### Supported browsers

The extension is available for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/easy-languages-dictionary/) and all Chromium-based browsers that support extensions ([Chrome](https://chromewebstore.google.com/detail/cclabikdbgmiadcihncalbdchliaambo), [MS Edge](https://microsoftedge.microsoft.com/addons/detail/easy-languages-dictionary/polkponobkkpkdjibgiomifmcokdihjl), [Opera](https://chromewebstore.google.com/detail/cclabikdbgmiadcihncalbdchliaambo), ...).

The extension is not available for Safari, for the following reasons:
- Publishing a Safari extension requires enrolling in the 'Apple Developer Program', at a cost of 99 $/year, which I have very little appetite for.
- Safari [doesn't support some WebExtension APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation/onHistoryStateUpdated#browser_compatibility) which this extension relies on.


### Linux

In the interest of stylistic coherence, for its translations, Easy Languages Dictionary attempts to match the font used for the subtitles in the Easy Languages YouTube videos. This font appears to be [Tahoma](https://en.wikipedia.org/wiki/Tahoma_(typeface)), and is not usually present on Linux systems. If you are the type of person who gets irritated by mismatched fonts and are running Linux, consider installing the Tahoma font.


## Supported languages

Most languages available on the Easy Languages channels are supported by Easy Languages Dictionary, however very few have been tested so far!


## License

© R.&thinsp;N. West, 2023-2024. Released under the [GPL](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) version 2 or greater. This software carries no warranty of any kind. Note that the license only covers the code published in this repository and not any trademarks. If you redistribute the software, modified or unmodified, make sure to change its name and icons so that your derivative cannot be mistaken for the original.
