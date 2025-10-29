/**
Translation via requests to various APIs is done in the background script. This
is because cross-origin requests are no longer allowed in content scripts in
manifest v3, see
https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/.

Furthermore, since YouTube is an single-page app, we need to notify the content
scripts about changes to the URL performed with `history.pushState()`.
*/


import respondToTranslationRequest from './lib/respondToTranslationRequest';
import notifyAboutURLChange from './lib/notifyAboutURLChange';


chrome.runtime.onMessage.addListener(respondToTranslationRequest);

chrome.webNavigation.onHistoryStateUpdated.addListener(
  notifyAboutURLChange,
  // Unfortunately, there doesn't seem to be a way to limit the
  // "webNavigation" permission to specific hostnames only. Therefore, the
  // background script is notified about all URL changes, and we need to
  // filter out those which happen in non-YouTube tabs.
  {url: [{hostSuffix: '.youtube.com'}]},
);
