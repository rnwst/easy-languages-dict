'use strict';

/**
Translation via requests to various APIs is done in the background script. This
is because cross-origin requests are no longer allowed in content scripts in
manifest v3, see
https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/.
*/


import respondToTranslationRequest from './respondToTranslationRequest.js';


chrome.runtime.onMessage.addListener(respondToTranslationRequest);
