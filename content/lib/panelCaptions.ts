import type {Caption} from './captions.js';
import {waitForMessage} from './messages.js';

/** Send the metadata track identity; MAIN owns context and deduplication.
 * Cancellation detaches this caller, leaving other subscribers independent.
 */
export async function fetchPanelCaptions(
  track: YTCaptionTrack, signal: AbortSignal,
): Promise<Caption[]> {
  signal.throwIfAborted();
  if (!track.vssId) return [];
  const videoId = new URL(track.baseUrl, location.href).searchParams.get('v');
  if (!videoId) return [];
  const operationId = [...crypto.getRandomValues(new Uint32Array(4))].join('-');
  const pending = waitForMessage<TranscriptPanelResponse>(
    'TRANSCRIPT_PANEL_RESPONSE', signal,
    response => response?.operationId === operationId &&
      response.videoId === videoId && response.vssId === track.vssId, 12000,
  );
  postMessage({origin: 'EASY_LANGUAGES_DICT_EXT',
    type: 'TRANSCRIPT_PANEL_REQUEST', content: {operationId, videoId,
      vssId: track.vssId, languageCode: track.languageCode,
      kind: track.kind ?? ''}}, location.origin);
  try {
    const response = await pending;
    signal.throwIfAborted();
    const cues = response.captions;
    if (response.outcome !== 'success' || !Array.isArray(cues) ||
        cues.length > 10000 || cues.some((cue, index) =>
      !cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) ||
      cue.start < 0 || cue.end <= cue.start || typeof cue.text !== 'string' ||
      cue.text.length > 10000 || (index > 0 &&
        cues[index - 1].end > cue.start))) return [];
    return cues.map(({start, end, text}) => ({start, end, text}));
  } finally {
    postMessage({origin: 'EASY_LANGUAGES_DICT_EXT',
      type: 'TRANSCRIPT_PANEL_CANCEL', content: {operationId}},
    location.origin);
  }
}
