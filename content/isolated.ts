import {
  extractVideoId, onMobile, waitForElt,
  addRewindFastfwdListener, removeRewindFastfwdListener,
  waitForContent,
} from './lib/utils.js';
import {
  registerMetadataListener, getVideoMetadata, getVideoLang,
} from './lib/metadata.js';
import {
  fetchCaptions, getPreferredCaptionTrack, nativeCaptions,
} from './lib/captions.js';
import {observeMessages} from './lib/messages.js';
import {renderSubtitles} from './lib/subtitles.js';

let videoId: string | null;
let current = new AbortController();
let state: 'idle' | 'loading' | 'ready' | 'unavailable' | 'failed' = 'idle';

registerMetadataListener((metadata) => {
  if (metadata.videoDetails.videoId === videoId && metadata.captions &&
      (state === 'unavailable' || state === 'failed')) navigate(true);
});
// A manual CC click may succeed after initialization timed out. Reuse that
// response immediately instead of requiring navigation or another play event.
observeMessages<CaptionResponse>('CAPTION_RESPONSE', undefined, (response) => {
  if (response?.params?.v === videoId &&
      (state === 'failed' || state === 'unavailable') &&
      nativeCaptions(response)) navigate(true);
});

async function main(id: string, signal: AbortSignal) {
  const metadata = await getVideoMetadata(id, signal);
  signal.throwIfAborted();
  if (!metadata.captions) return false;
  const lang = getVideoLang(metadata as YTVideoMetadataWithCaptions);
  // The dictionary overlay is for non-English source videos. Leave native
  // captions alone, and avoid starting acquisition for English videos.
  if (!lang || lang === 'en') return false;
  const tracks =
    metadata.captions.playerCaptionsTracklistRenderer.captionTracks;
  const track = getPreferredCaptionTrack(tracks, lang);
  const englishTrack = tracks.filter(value => /^en(?:-|$)/i.test(
    value.languageCode)).sort((a, b) =>
    Number(a.kind === 'asr') - Number(b.kind === 'asr'))[0];
  if (!track) return false;
  // The mobile page creates its playable video after Play is pressed. On
  // desktop, start listening for the user's CC choices right away, even in ads.
  if (onMobile()) await waitForElt('video[src]', signal, 0);
  const {captions, translatedCaptions} = await fetchCaptions(
    track, signal, englishTrack,
  );
  await waitForContent(signal);
  signal.throwIfAborted();
  if (!captions.length) return false;
  // YouTube may replace the player or video element when an ad finishes. Find
  // them now so caption timing follows the actual video, not a removed ad.
  const player = await waitForElt<HTMLElement>(
    onMobile() ? '#player-container-id' : '#movie_player', signal,
  );
  const video = await waitForElt<HTMLVideoElement>(
    onMobile() ? '#player-container-id video[src]' : '#movie_player video',
    signal, onMobile() ? 0 : 15000,
  );
  const updateTranslation = renderSubtitles(
    player, video, captions, lang, signal,
  );
  addRewindFastfwdListener();
  signal.addEventListener('abort', removeRewindFastfwdListener, {once: true});
  void translatedCaptions.then((translated) => {
    if (!signal.aborted) updateTranslation(translated);
  }).catch((error) => {
    if (!signal.aborted) {
      console.warn('English captions unavailable; original captions remain.',
        error);
    }
  });
  return true;
}

function navigate(force = false) {
  const next = extractVideoId(document.URL);
  if (next === videoId && !force) return;
  current.abort();
  current = new AbortController();
  videoId = next;
  state = next ? 'loading' : 'idle';
  if (!next) return;
  const {signal} = current;
  void main(next, signal).then((rendered) => {
    if (!signal.aborted) state = rendered ? 'ready' : 'unavailable';
  }).catch((error) => {
    if (!signal.aborted) {
      state = 'failed';
      console.warn('YouTube Subtitle Translator:',
        error instanceof Error ? error.message : String(error));
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (typeof message?.url === 'string') navigate();
});
// Also handles navigation in browsers where background notification is delayed.
document.addEventListener('yt-navigate-finish', () => navigate());
// If startup failed while the player was still being initialized, a later
// user-initiated playback can retry without requiring a page reload.
document.addEventListener('playing', () => {
  if (state === 'failed') navigate(true);
}, {capture: true});
window.addEventListener('pagehide', () => current.abort());
window.addEventListener('pageshow', (evt) => {
  if (evt.persisted) navigate(true);
});
navigate();
