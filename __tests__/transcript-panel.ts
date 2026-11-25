import {readFileSync} from 'node:fs';
import {
  encodePanelParams, findPanelParams, parseTranscriptPanel,
} from '../content/lib/transcriptPanel.js';
import {installTranscriptPanel} from '../content/lib/transcriptPanelBridge.js';

const videoId = 'Z9PRhksKFqU';
const marker = 'EASY_LANGUAGES_DICT_EXT';
const fixture = (lang = 'pl') => JSON.parse(readFileSync(
  `__tests__/fixtures/panel-${lang}.json`, 'utf8'));
const renderers = (data = fixture()) => data.content
  .engagementPanelSectionListRenderer.content.sectionListRenderer.contents;
const entity = (data = fixture()) => data.frameworkUpdates.entityBatchUpdate
  .mutations[0].payload.timedMarkersListSyncEntity;

describe('modern transcript parsing', () => {
  it('reuses only verified modern native selections for this video and track',
    () => {
      const params = encodeURIComponent(encodePanelParams(videoId, '.pl'));
      const endpoint = {panelId: 'PAmodern_transcript_view', params};
      expect(findPanelParams({getPanelEndpoint: endpoint}, videoId, '.pl'))
        .toBe(params);
      expect(findPanelParams({getTranscriptEndpoint: endpoint}, videoId, '.pl'))
        .toBeUndefined();
      expect(findPanelParams({getPanelEndpoint: endpoint}, videoId, '.en'))
        .toBeUndefined();
      expect(findPanelParams({getPanelEndpoint: endpoint}, 'other', '.pl'))
        .toBeUndefined();
      expect(findPanelParams({getPanelEndpoint: {...endpoint, params: '%'}},
        videoId, '.pl')).toBeUndefined();
    });

  it.each([
    ['pl', 'Ja bardzo lubię jeździć na rowerze.'],
    ['en', 'I really like riding a bike.'],
  ])('parses sanitized live %s items with overlap clamping', (lang, text) => {
    const cues = parseTranscriptPanel(fixture(lang), videoId);
    expect(cues).toHaveLength(3);
    expect(cues.map(({start, end}) => [start, end])).toEqual([
      [76, 85], [85, 91], [91, 102.27],
    ]);
    expect(cues[1].text).toBe(text);
  });

  it('joins section and index despite independently reordered lists',
    () => {
      const data = fixture();
      const section = renderers(data)[0].itemSectionRenderer;
      const second = JSON.parse(JSON.stringify(section));
      second.sectionIdentifier = 'timeline_view_section1';
      second.contents = [second.contents[1]];
      const item = second.contents[0].macroMarkersPanelItemViewModel;
      item.index = 9;
      item.item.timelineItemViewModel.contentItems[0]
        .transcriptSegmentViewModel.simpleText = 'Second section';
      renderers(data).unshift({itemSectionRenderer: second});
      entity(data).timedListData.sections.unshift({
        sectionId: 'timeline_view_section1', timedSyncDataList: [{
          syncItemId: 'timeline_view_sync_item1_9',
          videoTimeMs: '110000', endTimeMs: '115120',
        }],
      });
      section.contents.reverse();
      entity(data).timedListData.sections[1].timedSyncDataList.reverse();
      // An unrelated section must not shift either transcript list's indexes.
      const unrelated = JSON.parse(JSON.stringify(entity(data)));
      unrelated.key = 'unrelated';
      unrelated.timedListData.sections = [{sectionId: 'unrelated-section',
        timedSyncDataList: []}];
      data.frameworkUpdates.entityBatchUpdate.mutations.unshift({
        payload: {timedMarkersListSyncEntity: unrelated},
      });
      const cues = parseTranscriptPanel(data, videoId);
      expect(cues).toHaveLength(4);
      expect(cues[1].text).toBe('Ja bardzo lubię jeździć na rowerze.');
      expect(cues[3]).toEqual({start: 110, end: 115.12,
        text: 'Second section'});
    });

  it('normalizes equal rounded starts like native captions', () => {
    const data = fixture();
    entity(data).timedListData.sections[0].timedSyncDataList[1]
      .videoTimeMs = '76000';
    const cues = parseTranscriptPanel(data, videoId);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({start: 76, end: 91,
      text: 'Ja bardzo lubię jeździć na rowerze.'});
  });

  it.each([undefined, null, {}, {content: []}, {frameworkUpdates: 'invalid'}])(
    'rejects missing or unsupported structures: %j', data => {
      expect(parseTranscriptPanel(data, videoId)).toEqual([]);
    });

  it.each([undefined, '', '-1', 'NaN', 'Infinity', null, {}, '85000']) (
    'skips invalid or zero-duration end time %j', end => {
      const data = fixture();
      entity(data).timedListData.sections[0].timedSyncDataList[1]
        .endTimeMs = end;
      expect(parseTranscriptPanel(data, videoId)).toHaveLength(2);
    });

  it('rejects wrong-video items and duplicate identities', () => {
    const data = fixture();
    expect(parseTranscriptPanel(data, 'another-video')).toEqual([]);
    const items = renderers(data)[0].itemSectionRenderer.contents;
    items.push(items[0]);
    expect(parseTranscriptPanel(data, videoId)).toEqual([]);
  });

  it('rejects ambiguous timing sections even in different entities', () => {
    const data = fixture();
    const duplicate = JSON.parse(JSON.stringify(entity(data)));
    duplicate.key = 'another-timing-entity';
    data.frameworkUpdates.entityBatchUpdate.mutations.push({
      payload: {timedMarkersListSyncEntity: duplicate},
    });
    expect(parseTranscriptPanel(data, videoId)).toEqual([]);
  });

  it('rejects excessive items and text', () => {
    const data = fixture();
    const items = renderers(data)[0].itemSectionRenderer.contents;
    const segment = items[0].macroMarkersPanelItemViewModel.item
      .timelineItemViewModel.contentItems[0].transcriptSegmentViewModel;
    segment.simpleText = 'a'.repeat(10001);
    expect(parseTranscriptPanel(data, videoId)).toEqual([]);
    renderers(data)[0].itemSectionRenderer.contents = Array(10001).fill({});
    expect(parseTranscriptPanel(data, videoId)).toEqual([]);
  });

  it('encodes the observed protobuf and multibyte strings with varint lengths',
    () => {
      expect(encodePanelParams(videoId, '.pl')).toBe(
        'qgkUCgtaOVBSaGtzS0ZxVRgBMgMucGw=');
      const track = '.pl.' + 'ż'.repeat(70);
      const bytes = Buffer.from(encodePanelParams(videoId, track), 'base64');
      // Independently inspect the wire bytes: outer tag 145, a two-byte
      // length, and a 144-byte UTF-8 track behind its own two-byte length.
      expect([...bytes.subarray(0, 4)]).toEqual([170, 9, 162, 1]);
      expect([...bytes.subarray(19, 22)]).toEqual([50, 144, 1]);
      expect(bytes.subarray(22).toString('utf8')).toBe(track);
    });
});

function bridge() {
  const root = new EventTarget() as unknown as Window;
  const postMessage = jest.fn();
  const fetch = jest.fn<ReturnType<typeof window.fetch>,
    Parameters<typeof window.fetch>>();
  const tracks = ['pl', 'en'].map(languageCode => ({languageCode,
    vssId: '.' + languageCode, kind: undefined,
    baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}`,
    name: {simpleText: languageCode}, isTranslatable: true}));
  const metadata = {videoDetails: {videoId}, captions: {
    playerCaptionsTracklistRenderer: {captionTracks: tracks},
  }} as YTVideoMetadata;
  Object.assign(root, {postMessage, fetch, location: {
    href: `https://www.youtube.com/watch?v=${videoId}`,
    origin: 'https://www.youtube.com',
  }});
  const context = {client: {visitorData: 'private-context'}};
  const api = installTranscriptPanel({root, metadata: () => metadata,
    context: () => context});
  const message = (type: string, content: unknown, overrides = {}) => {
    root.dispatchEvent(new MessageEvent('message', {
      source: root, origin: root.location.origin,
      data: {origin: marker, type, content}, ...overrides,
    }));
  };
  const request = (operationId = 'first', lang = 'pl', overrides = {}) =>
    message('TRANSCRIPT_PANEL_REQUEST', {operationId, videoId,
      vssId: '.' + lang, languageCode: lang, kind: '', ...overrides});
  const results = () => postMessage.mock.calls.map(call => call[0].content);
  fetch.mockImplementation(async () => new Response(JSON.stringify(fixture())));
  return {root, fetch, message, request, results, metadata, api, context};
}

describe('bounded private panel bridge', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shares concurrent callers and caches success across startup retries',
    async () => {
      const f = bridge();
      f.request();
      f.request('second');
      f.request('second');
      await jest.advanceTimersByTimeAsync(0);
      f.request('retry');
      expect(f.fetch).toHaveBeenCalledTimes(1);
      expect(f.results()).toHaveLength(3);
      expect(f.results().every(result => result.outcome === 'success')).toBe(
        true);
      const [url, init] = f.fetch.mock.calls[0];
      expect(url).toBe('/youtubei/v1/get_panel?prettyPrint=false');
      expect(init).toMatchObject({method: 'POST', redirect: 'error',
        credentials: 'same-origin'});
      expect(JSON.parse(init!.body as string)).toEqual({context: f.context,
        panelId: 'PAmodern_transcript_view',
        params: encodePanelParams(videoId, '.pl')});
      expect(JSON.stringify(f.results())).not.toContain('private-context');
      expect(jest.getTimerCount()).toBe(0);
    });

  it.each([
    {videoId: 'other'}, {vssId: ''}, {vssId: '.fr'},
    {vssId: 'a.pl'}, {languageCode: 'en'}, {kind: 'asr'},
  ])('rejects unsupported metadata identities %j', async overrides => {
    const f = bridge();
    f.request('invalid', 'pl', overrides);
    await jest.advanceTimersByTimeAsync(0);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.results()[0].outcome).toBe('unavailable');
  });

  it('ignores foreign messages and rejects ambiguous metadata identities',
    () => {
      const f = bridge();
      f.message('TRANSCRIPT_PANEL_REQUEST', {operationId: 'foreign'},
        {source: null});
      expect(f.results()).toEqual([]);
      f.metadata.captions!.playerCaptionsTracklistRenderer.captionTracks.push(
        f.metadata.captions!.playerCaptionsTracklistRenderer.captionTracks[0]);
      f.request();
      expect(f.fetch).not.toHaveBeenCalled();
    });

  it.each([403, 429, 500])('caches HTTP %s without retry', async status => {
    const f = bridge();
    f.fetch.mockImplementation(async () => new Response('', {status}));
    f.request();
    await jest.advanceTimersByTimeAsync(0);
    f.request('retry');
    f.request('english', 'en');
    await jest.advanceTimersByTimeAsync(20000);
    expect(f.fetch).toHaveBeenCalledTimes(status === 429 ? 1 : 2);
    expect(f.results().map(result => result.outcome)).toEqual(
      Array(3).fill(status === 429 ? 'rate-limited' : 'unavailable'));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('suppresses panels after native 429 until navigation', async () => {
    const f = bridge();
    f.api.rateLimit(videoId);
    f.request();
    expect(f.fetch).not.toHaveBeenCalled();
    f.root.dispatchEvent(new Event('yt-navigate-start'));
    f.root.dispatchEvent(new Event('yt-navigate-finish'));
    f.request('next-session');
    await jest.advanceTimersByTimeAsync(0);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.results()[1].outcome).toBe('success');
  });

  it('cancels subscribers independently and retains exhausted attempts',
    async () => {
      const f = bridge();
      let resolve!: (response: Response) => void;
      f.fetch.mockImplementation(() => new Promise(r => resolve = r));
      f.request();
      f.request('second');
      f.message('TRANSCRIPT_PANEL_CANCEL', {operationId: 'first'});
      const signal = f.fetch.mock.calls[0][1]!.signal!;
      expect(signal.aborted).toBe(false);
      f.message('TRANSCRIPT_PANEL_CANCEL', {operationId: 'second'});
      expect(signal.aborted).toBe(true);
      resolve(new Response(JSON.stringify(fixture())));
      await jest.advanceTimersByTimeAsync(0);
      f.request('retry');
      expect(f.fetch).toHaveBeenCalledTimes(1);
      expect(f.results()).toHaveLength(1);
      expect(f.results()[0].outcome).toBe('cancelled');
    });

  it.each(['yt-navigate-start', 'pagehide', 'silent-url-change'])(
    'rejects late responses after %s', async event => {
      const f = bridge();
      let resolve!: (response: Response) => void;
      f.fetch.mockImplementation(() => new Promise(r => resolve = r));
      f.request();
      if (event === 'silent-url-change') {
        f.root.location.href = 'https://www.youtube.com/watch?v=other';
      } else f.root.dispatchEvent(new Event(event));
      resolve(new Response(JSON.stringify(fixture())));
      await jest.advanceTimersByTimeAsync(0);
      expect(f.results()).toHaveLength(1);
      expect(f.results()[0].captions).toEqual([]);
      expect(jest.getTimerCount()).toBe(0);
    });

  it('bounds hanging transports even when they ignore abort', async () => {
    const f = bridge();
    f.fetch.mockImplementation(() => new Promise(() => {}));
    f.request();
    await jest.advanceTimersByTimeAsync(10000);
    f.request('retry');
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.results().map(result => result.outcome)).toEqual(
      ['cancelled', 'cancelled']);
    expect(f.fetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['malformed', 'wrong-video', 'oversized-header', 'oversized-body'])(
    'rejects %s responses without retry', async scenario => {
      const f = bridge();
      const data = fixture();
      const item = renderers(data)[0].itemSectionRenderer.contents[0]
        .macroMarkersPanelItemViewModel;
      item.onTap.innertubeCommand.watchEndpoint.videoId = 'other';
      f.fetch.mockImplementation(async () => new Response(
        scenario === 'oversized-body' ? 'x'.repeat(4 * 1024 * 1024 + 1) :
          scenario === 'wrong-video' ? JSON.stringify(data) : 'invalid',
        {headers: scenario === 'oversized-header' ?
          {'Content-Length': String(4 * 1024 * 1024 + 1)} : {}},
      ));
      f.request();
      await jest.advanceTimersByTimeAsync(0);
      f.request('retry');
      expect(f.fetch).toHaveBeenCalledTimes(1);
      expect(f.results().map(result => result.outcome)).toEqual(
        ['unavailable', 'unavailable']);
      expect(jest.getTimerCount()).toBe(0);
    });
});
