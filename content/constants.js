'use strict';

/**
 * Time spent idle between OCRing of screenshots. Increase to reduce CPU load.
 * Decrease to increase responsiveness of OCRing.
 * @type {number}
 */
export const REST_TIME = 50; // in milliseconds


/**
 * Vertical boundary positions of subtitle text band, as a fraction of total
 * video height. Used for taking screenshot of subtitle band, and positioning of
 * HTML elements overlaid on video.
 * @type {object}
 */
export const VERT_SUBTITLE_POS = {
  start: 0.780,
  end: 0.857,
};


/**
 * Known API key for Innertube, YouTube's private API.
 * @type {string}
 */
export const KNOWN_INNERTUBE_API_KEY =
    'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';


/**
 * Known YouTube web client version.
 * @type {string}
 */
export const KNOWN_WEB_CLIENT_VERSION = '2.20231109.10.00';
