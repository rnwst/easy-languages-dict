//@ts-check
'use strict';

/**
 * Notify content scripts running in tabs about changes to URLs. This is
 * necessary since YouTube is an single-page app and updates URLs with
 * `history.pushState`.
 * @param {object} eventDetails - Details about URL change event
 */
export default function notifyAboutURLChange(eventDetails) {
  chrome.tabs.sendMessage(
      eventDetails.tabId,
      {
        url: eventDetails.url,
      },
  );
}
