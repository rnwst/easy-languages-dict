/**
 * Notify content scripts running in tabs about changes to URLs. This is
 * necessary since YouTube is an single-page app and updates URLs with
 * `history.pushState`.
 */
export default function notifyAboutURLChange(
  eventDetails: { tabId: number; url: string }
) {
  chrome.tabs.sendMessage(
      eventDetails.tabId,
      {
        url: eventDetails.url,
      },
  );
}
