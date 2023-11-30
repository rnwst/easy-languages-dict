'use strict';

/**
 * Time spent waiting before checking again if video is playing. This will be
 * replaced by an event-driven implementation soon.
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
  top: 0.780,
  bottom: 0.857,
};


/**
 * Font size of the main subtitles of Easy Languages videos, as a fraction of
 * the video height. The English translation subtitles are around 22% smaller.
 * @type {number}
 */
export const FONT_SIZE_VIDEO_HEIGHT_FRACTION = 0.05;


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
