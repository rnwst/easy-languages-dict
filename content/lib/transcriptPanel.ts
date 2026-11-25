import {parseCaptions, type Caption} from './captions.js';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ?
    value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const field = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce((value, key) => record(value)[key], value);

/** Encode field 145's video/track selection with UTF-8 and protobuf lengths. */
export function encodePanelParams(videoId: string, vssId: string): string {
  const varint = (value: number): number[] => {
    const bytes = [];
    do {
      const byte = value % 128;
      value = Math.floor(value / 128);
      bytes.push(byte | (value ? 128 : 0));
    } while (value);
    return bytes;
  };
  const string = (tag: number, value: string): number[] => {
    const bytes = new TextEncoder().encode(value);
    return [tag, ...varint(bytes.length), ...bytes];
  };
  const inner = [...string(10, videoId), 24, 1, ...string(50, vssId)];
  return btoa([170, 9, ...varint(inner.length), ...inner]
    .map(byte => String.fromCharCode(byte)).join(''));
}

/** Reuse a modern native selection when its wire data matches this track.
 * Legacy getTranscriptEndpoint params use another schema and are not reused.
 * Limit traversal of the page's large initial data and never guess a track from
 * a menu label. Unknown parameter layouts fall back to our explicit selection.
 */
export function findPanelParams(
  data: unknown, videoId: string, vssId: string,
): string | undefined {
  const expected = atob(encodePanelParams(videoId, vssId));
  const pending = [data];
  const seen = new Set<object>();
  for (let count = 0; pending.length && count < 5000; count++) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const endpoint = field(value, 'getPanelEndpoint');
    const params = field(endpoint, 'params');
    if (field(endpoint, 'panelId') === 'PAmodern_transcript_view' &&
        typeof params === 'string' && params.length <= 4096) {
      try {
        const normalized = decodeURIComponent(params)
          .replace(/-/g, '+').replace(/_/g, '/');
        if (atob(normalized) === expected) return params;
      } catch { /* Malformed native selections are not usable. */ }
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      if (pending.length >= 5000) break;
      if (child && typeof child === 'object') pending.push(child);
    }
  }
}

/** The modern panel links each item index to a named timing section.
 * Do not collect arbitrary text/timing arrays: panels can contain other lists.
 * Unknown schemas are unavailable rather than guessed from display timestamps.
 */
export function parseTranscriptPanel(
  data: unknown, videoId: string,
): Caption[] {
  const timing = new Map<string, Map<number, {start: number; end: number}>>();
  const mutations = list(field(data, 'frameworkUpdates', 'entityBatchUpdate',
    'mutations'));
  if (mutations.length > 100) return [];
  let total = 0;
  for (const mutation of mutations) {
    const entity = field(mutation, 'payload', 'timedMarkersListSyncEntity');
    const sections = list(field(entity, 'timedListData', 'sections'));
    if (sections.length > 100) return [];
    for (const section of sections) {
      const id = field(section, 'sectionId');
      if (typeof id !== 'string') continue;
      const suffix = /^timeline_view_section(\d+)$/.exec(id)?.[1];
      if (suffix === undefined) continue;
      // Item markersEngagementPanelSyncEntityKey references the panel-state
      // entity, NOT this timedMarkersListSyncEntity. Join by section identity;
      // duplicate section IDs across timing entities are ambiguous, so reject.
      if (timing.has(id)) return [];
      const items = new Map<number, {start: number; end: number}>();
      timing.set(id, items);
      for (const entry of list(field(section, 'timedSyncDataList'))) {
        if (++total > 10000) return [];
        const syncId = field(entry, 'syncItemId');
        const match = typeof syncId === 'string' ?
          /^timeline_view_sync_item(\d+)_(\d+)$/.exec(syncId) : null;
        if (!match || match[1] !== suffix) continue;
        const milliseconds = (value: unknown): number => {
          if (typeof value !== 'number' &&
              !(typeof value === 'string' && /^\d+$/.test(value))) return NaN;
          const number = Number(value);
          return Number.isSafeInteger(number) && number >= 0 ? number : NaN;
        };
        const start = milliseconds(field(entry, 'videoTimeMs'));
        const end = milliseconds(field(entry, 'endTimeMs'));
        const index = Number(match[2]);
        if (!Number.isSafeInteger(index) || items.has(index)) return [];
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          items.set(index, {start, end});
        }
      }
    }
  }
  const sections = list(field(data, 'content',
    'engagementPanelSectionListRenderer', 'content', 'sectionListRenderer',
    'contents'));
  if (sections.length > 100) return [];
  const cues: Caption[] = [];
  const seen = new Set<string>();
  total = 0;
  for (const section of sections) {
    const renderer = field(section, 'itemSectionRenderer');
    const id = field(renderer, 'sectionIdentifier');
    if (typeof id !== 'string') continue;
    for (const entry of list(field(renderer, 'contents'))) {
      if (++total > 10000) return [];
      const item = field(entry, 'macroMarkersPanelItemViewModel');
      if (!item) continue;
      if (field(item, 'onTap', 'innertubeCommand', 'watchEndpoint', 'videoId')
          !== videoId) return [];
      if (field(item, 'panelId') !== 'PAmodern_transcript_view') continue;
      const index = field(item, 'index');
      if (typeof index !== 'number' || !Number.isSafeInteger(index) ||
          index < 0) continue;
      const time = timing.get(id)?.get(index);
      if (!time) continue;
      const itemId = JSON.stringify([id, index]);
      if (seen.has(itemId)) return [];
      seen.add(itemId);
      const parts = list(field(item, 'item', 'timelineItemViewModel',
        'contentItems'));
      if (parts.length > 100) return [];
      const text = parts.map(part => field(part, 'transcriptSegmentViewModel',
        'simpleText')).filter((text): text is string =>
        typeof text === 'string').join(' ');
      if (text.length > 10000) return [];
      if (text.trim()) cues.push({...time, text});
    }
  }
  // Match native overlap normalization, including equal rounded start times.
  cues.sort((a, b) => a.start - b.start);
  return parseCaptions({events: cues.map(cue => ({tStartMs: cue.start,
    dDurationMs: cue.end - cue.start, segs: [{utf8: cue.text}]}))});
}
