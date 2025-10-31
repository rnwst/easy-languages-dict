import readLangsDotCSV from './readLangsDotCSV.js';


/**
 * Array of languages.
 */
const LANGS_ARR = readLangsDotCSV();


/**
 * Get languages from array of languages whose table row entry corresponding to
 * a given header equals a given value.
 */
export async function getLangsByHeader(header: string, value: string) {
  return (await LANGS_ARR).filter((lang) => lang[header] === value);
}


/**
 * Get language from table of languages whose name is equal to a given value.
 */
export async function getLangByName(name: string) {
  return (await getLangsByHeader('name', name))[0];
}


/**
 * Get language from table of languages whose channel handle is equal to a given
 * value.
 */
export async function getLangByChannelHandle(channelHandle: string) {
  return (await getLangsByHeader('channelHandle', channelHandle))[0];
}


/**
 * Get language from video title (this needs to be done if the video was
 * uploaded by the Easy Languages YT channel, in which case the language cannot
 * be deduced from the channel name).
 */
export function extractLangFromTitle(videoTitle: string): string | undefined {
  return videoTitle
    .match(/Easy (?:\w+? )?(?<lang>\w+) \d+/)?.groups?.lang.toLowerCase();
}


/**
 * Determine language of Easy Languages video. Return falsy value if video is
 * not an Easy Languages video.
 */
export default async function getLang(videoMetadata:
    { channelHandle: string; title: string }) {
  if (videoMetadata.channelHandle === 'easylanguages') {
    return getLangByName(extractLangFromTitle(videoMetadata.title) ?? 'german');
  }
  return getLangByChannelHandle(videoMetadata.channelHandle);
}
