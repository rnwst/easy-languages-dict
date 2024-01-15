import readLangsDotCSV from './readLangsDotCSV.js';


/**
 * Array of languages.
 * @type {array}
 */
const LANGS_ARR = readLangsDotCSV();


/**
 * Get languages from array of languages whose table row entry corresponding to
 * a given header equals a given value.
 * @param {string} header - Table header
 * @param {string} value - Row entry value
 * @return {array} - Array of matching languages
 */
export async function getLangsByHeader(header, value) {
  return (await LANGS_ARR).filter((lang) => lang[header] === value);
}


/**
 * Get language from table of languages whose name is equal to a given value.
 * @param {string} name - Language name
 * @return {object} - Language
 */
export async function getLangByName(name) {
  return (await getLangsByHeader('name', name))[0];
}


/**
 * Get language from table of languages whose channel handle is equal to a given
 * value.
 * @param {string} channelHandle - Language name
 * @return {object} - Language
 */
export async function getLangByChannelHandle(channelHandle) {
  return (await getLangsByHeader('channelHandle', channelHandle))[0];
}


/**
 * Get language from video title (this needs to be done if the video was
 * uploaded by the Easy Languages YT channel, in which case the language cannot
 * be deduced from the channel name).
 * @param {string} videoTitle - YT video title
 * @return {string} - Language
 */
export function extractLangFromTitle(videoTitle) {
  return videoTitle
      .match(/Easy (?:\w+? )?(?<lang>\w+) \d+/)?.groups.lang.toLowerCase();
}


/**
 * Determine language of Easy Languages video. Return falsy value if video is
 * not an Easy Languages video.
 * @param {string} videoMetadata - Video metadata
 * @return {string} - Language of current video
 */
export default async function getLang(videoMetadata) {
  if (videoMetadata.channelHandle === 'easylanguages') {
    return getLangByName(extractLangFromTitle(videoMetadata.title));
  } else {
    return getLangByChannelHandle(videoMetadata.channelHandle);
  }
}
