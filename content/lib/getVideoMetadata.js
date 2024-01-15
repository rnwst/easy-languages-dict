'use strict';

import {KNOWN_INNERTUBE_API_KEY, KNOWN_WEB_CLIENT_VERSION}
  from './constants.js';
import {onMobile} from './utils.js';


/**
 * Concatenate all the page's scripts.
 * @return {string} - Concatenation of all the page's scripts
 */
function concatAllScripts() {
  return ''.concat(
      ...Array.from(document.scripts).map((script) => script.innerHTML));
}


/**
 * Concatenation of all the page's scripts.
 * @type {string}
 */
const SCRIPTS = concatAllScripts();


/**
 * Obtain key for Innertube, YouTube's private API. This API key does not seem
 * to change very often, if at all - there are several references to this exact
 * key in several repositories and on Stackoverflow. Nonetheless, in the event
 * of a change it would be great if the extension continues to work. Therefore,
 * this extension attempts to extract the key from the page.
 * @return {string} - Innertube API key
 */
export function getInnertubeAPIKey() {
  let key = SCRIPTS.match(/"INNERTUBE_API_KEY":"(?<key>[^"]+?)"/)
      ?.groups?.key;
  if (!key) {
    key = KNOWN_INNERTUBE_API_KEY;
    console.error(
        'Easy Languages Dictionary: Unable to obtain Innertube API Key! ' +
        `Using known key ${key} instead.`);
  }
  return key;
}


/**
 * Key for Innertube, YouTube's private API.
 * @type {string}
 */
const INNERTUBE_API_KEY = getInnertubeAPIKey();


/**
 * Obtain YouTube web client version to be included in Innertube API requests.
 * This is expected to change on a regular basis. It makes sense to use the
 * current Web Client version for the request, as older versions are unlikely to
 * be supported indefinitely.
 * @return {string} - YT web client version
 */
export function getWebClientVersion() {
  let version = SCRIPTS.match(/\{"key":"cver","value":"(?<version>[\d.]+?)"\}/)
      ?.groups?.version;
  if (!version) {
    version = KNOWN_WEB_CLIENT_VERSION;
    console.error(
        'Easy Languages Dictionary: Unable to obtain YT web client version! ' +
        `Using known version ${version} instead.`);
  }
  return version;
}


/**
 * YouTube web client version to be included in Innertube API requests.
 * @type {string}
 */
const WEB_CLIENT_VERSION = getWebClientVersion();


/**
 * Fetch metadata for given YouTube video.
 * @param {string} videoId - YT video Id
 * @param {string} webClientVersion - YT web client version
 * @return {object} - Response promise
 */
export function fetchMetadata(videoId) {
  // need to retry in case of poor connection...
  return fetch(
      `https://${onMobile() ? 'm' : 'www'}.youtube.com/youtubei/v1/player?` +
      `key=${INNERTUBE_API_KEY}`,
      {
        method: 'POST',
        body: JSON.stringify({
          'context': {
            'client': {
              'clientName': 'WEB',
              'clientVersion': WEB_CLIENT_VERSION,
            },
            'request': {
              'useSsl': true,
            },
          },
          'videoId': videoId,
        }),
      },
  );
}


/**
 * Extract channel handle from channel URL. Example: The channel handle of
 * 'https://www.youtube.com/@EasyPolish' is 'EasyPolish'.
 * @param {string} channelURL - Channel URL
 * @return {string} - Channel handle
 */
export function extractChannelHandle(channelURL) {
  return new URL(channelURL).pathname
      ?.match(/\/@(?<handle>[a-zA-Z0-9_\-.]+)/)?.groups?.handle;
}


/**
 * Obtain video metadata. This could be done by inspecting the page using
 * `MutationObserver`s. However, this would be a very messy and fragile
 * solution, as the precise sequence of mutations would need to be known to
 * prevent erroneously grabbing metadata from the previously watched video. The
 * procedure would also be different for the desktop and mobile YT pages. A
 * solution not fraught with these issues would be to intercept responses to the
 * API calls that the YT web client is making to obtain video metadata. This is
 * possible in Firefox using `webRequest.filterResponseData()`
 * (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData),
 * but unfortunately, this has not yet been implemented in Chromium:
 * https://bugs.chromium.org/p/chromium/issues/detail?id=487422. The next best
 * solution is for this extension to duplicate the API call. This is not ideal
 * due to redundant data transmission, but until `filterResponseData` is
 * implemented in Chromium, there is no good alternative.
 * @param {string} videoId - YT Video Id
 * @return {object} - Video Metadata
 */
export default async function getVideoMetadata(videoId) {
  let title; let channelURL; let publicationDate;
  const fetchTitleAndChannelURL = async (webClientVersion) => {
    const response =
        await fetchMetadata(videoId);
    const responseData = await response.json();
    title = responseData.videoDetails?.title;
    channelURL =
        responseData.microformat?.playerMicroformatRenderer?.ownerProfileUrl;
    publicationDate = new Date(
        responseData.microformat?.playerMicroformatRenderer?.publishDate);
  };

  await fetchTitleAndChannelURL(getWebClientVersion());
  // Fetching the title and the channel URL could be unsuccessful due to an API
  // change and a corresponding YT web client change. In that case, passing an
  // old web client version might still work for a period of time (which will
  // hopefully be enough time to update this extension). Nonetheless, it is
  // advisable to try the newest web client version first, as the API cannot be
  // expected to support old web clients indefinitely.
  if ((!title || !channelURL || !publicationDate) &&
      (WEB_CLIENT_VERSION != KNOWN_WEB_CLIENT_VERSION)) {
    console.error(
        'Easy Languages Dictionary: Unable to obtain channel and video title ' +
        `for videoId '${videoId}' with new web client version! ` +
        'Trying once more with old web client version.');
    await fetchTitleAndChannelURL(KNOWN_WEB_CLIENT_VERSION);
  }

  const channelHandle = extractChannelHandle(channelURL);

  if (!title || !channelHandle || !publicationDate) {
    throw new Error(
        'Easy Languages Dictionary: Unable to obtain video metadata ' +
        `for videoId ${videoId}!`,
    );
  }

  return {channelHandle, title, publicationDate};
}
