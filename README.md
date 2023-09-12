# [Easy Languages Dictionary](#)

*Easy Languages Dictionary* is a browser extension to help you learn spoken languages. It provides translations of individual words in the subtitles of videos published by any of the [*Easy Languages* YouTube channels](https://www.youtube.com/@easylanguages/playlists). It recognizes the words in the subtitles using [Tesseract](https://github.com/naptha/tesseract.js/) and translates them using various online translation services. **It's still a WIP.**

<img src='./README-files/demo.webp' width='100%' />*This demonstration shows an excerpt from [this video](https://www.youtube.com/watch?v=prYx-rYtKgc) - © 2023 [Easy Polish YouTube Channel](https://www.youtube.com/@EasyPolish).*

While I am unaffiliated with the Easy Languages franchise and this extension is an entirely separate project, it would have no value without the great work done by the people running the Easy Languages channels. **Please consider supporting the channels on Patreon if you find their work useful!**


## Installation

**This extension is still a WIP and installation is not yet recommended**. For that reason, it is not yet available on any of the extension marketplaces. However, if you really cannot be discouraged:
``` console
git clone "https://github.com/rnwst/easy-languages-dict.git"
cd easy-languages-dict
npm install
npm run build
```
The last command will create a subdirectory named `dist/` which contains the bundled extension. In Chrome/Chromium, type `chrome://extensions` in the address bar, and click 'Load unpacked'. Select the `dist/` folder, and confirm. This will add the extension.

### Supported browsers

So far, this extension has only been tested on Chromium.

### Linux

In the interest of stylistic coherence, for its translations, Easy Languages Dictionary attempts to match the font used for the subtitles in the Easy Languages YouTube videos. This font appears to be [Tahoma](https://en.wikipedia.org/wiki/Tahoma_(typeface)), and is not usually present on Linux systems. If you are the type of person who gets irritated by mismatched fonts and are running Linux, consider installing the Tahoma font.


## Supported languages

All languages available on the Easy Languages channels should be supported by Easy Languages Dictionary, except for Miskito, Mooré, and Oshiwambo. However, very few have been tested so far!


## Known issues

- YouTube uses AJAX, which results in the content script not working right when navigating to a new page within YouTube, requiring a reload of the page. A fix for this is in the works.
- Currently, in videos that mix languages (such as [this one](https://www.youtube.com/watch?v=ySJa8swxrJc)), only the first language appearing in the video title works.
- Most languages are untested so far. That being said, all supported languages should work *in theory*.

## License

© 2023 R.&thinsp;N. West. Released under the [GPL](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) version 2 or greater. This software carries no warranty of any kind.
