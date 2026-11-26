import assert from 'node:assert/strict';
import {build} from 'esbuild';

let parsers;

/** Use the production parsers in Node without maintaining a second parser. */
export function productionParsers() {
  parsers ??= build({
    stdin: {contents: `
      export {parseCaptions} from './content/lib/captions.ts';
      export {parseTranscriptPanel, encodePanelParams}
        from './content/lib/transcriptPanel.ts';
    `, resolveDir: process.cwd()},
    bundle: true, write: false, platform: 'node', format: 'esm',
  }).then(result => import('data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')));
  return parsers;
}

/** Only assert fields the extension consumes; never dump raw signed URLs. */
export function validateMetadata(data, videoId, language) {
  assert(data?.videoDetails?.videoId === videoId,
    'Metadata must identify the current video');
  const renderer = data?.captions?.playerCaptionsTracklistRenderer;
  const tracks = renderer?.captionTracks;
  assert(Array.isArray(tracks) && tracks.length > 0,
    'Caption tracks must be a nonempty array');
  for (const track of tracks) {
    assert(typeof track.languageCode === 'string' &&
      /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/i.test(track.languageCode),
    'Caption tracks must identify their language');
    let url;
    try { url = new URL(track.baseUrl); } catch { /* Do not log the URL. */ }
    assert(url?.protocol === 'https:' &&
      /(^|\.)youtube\.com$/.test(url.hostname) &&
      url.pathname === '/api/timedtext',
    'Caption track URLs must point to YouTube timedtext');
  }
  if (language) {
    assert(tracks.some(track =>
      track.languageCode.split('-')[0] === language.split('-')[0]),
    'The configured source-language caption track must exist');
  }
  if (renderer.audioTracks !== undefined) {
    assert(Array.isArray(renderer.audioTracks), 'Audio tracks must be arrays');
    for (const audio of renderer.audioTracks) {
      assert(Array.isArray(audio.captionTrackIndices) &&
        audio.captionTrackIndices.every(index =>
          Number.isInteger(index) && index >= 0 && index < tracks.length),
      'Audio tracks must reference valid caption-track indices');
    }
  }
  return tracks;
}

export function validateCues(cues) {
  assert(Array.isArray(cues) && cues.length > 0,
    'The production parser must produce nonempty captions');
  assert(cues.every(cue => Number.isFinite(cue.start) && cue.start >= 0 &&
    Number.isFinite(cue.end) && cue.end > cue.start &&
    typeof cue.text === 'string' && cue.text.trim()),
  'Caption cues must have usable text and finite, increasing time bounds');
  return cues;
}

export function validateNativeCaptions(data, parseCaptions) {
  assert(Array.isArray(data?.events), 'Native captions must contain events');
  let cues;
  try { cues = parseCaptions(data); } catch {
    assert.fail('Native JSON is incompatible with the production parser');
  }
  return validateCues(cues);
}

export function validateTranscript(data, videoId, parseTranscriptPanel) {
  assert(Array.isArray(data?.frameworkUpdates?.entityBatchUpdate?.mutations),
    'Transcript timing must be supplied by entity mutations');
  assert(data?.content?.engagementPanelSectionListRenderer,
    'Transcript content must be an engagement panel');
  let cues;
  try { cues = parseTranscriptPanel(data, videoId); } catch {
    assert.fail('Transcript JSON is incompatible with the production parser');
  }
  return validateCues(cues);
}

/** Executed inside either the real page or the fixture page. */
export function readPlayerState() {
  const player = document.querySelector('#movie_player');
  const video = player?.querySelector('video');
  const button = player?.querySelector('button.ytp-subtitles-button');
  return {player: Boolean(player), video: Boolean(video),
    cc: Boolean(button), pressed: button?.getAttribute('aria-pressed'),
    ad: Boolean(player?.matches('.ad-showing, .ad-interrupting'))};
}

export function validatePlayer(state) {
  assert(state.player && state.video && state.cc,
    'The player must contain a video element and the native CC button');
  assert(['true', 'false'].includes(state.pressed),
    'The CC button must expose its state through aria-pressed');
}
