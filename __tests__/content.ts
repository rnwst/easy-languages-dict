import translateWord, {escapeHTML, removePunctuation}
  from '../content/lib/translateWord.js';
import {parseCaptions, getPreferredCaptionTrack}
  from '../content/lib/captions.js';
import {activeCaption, renderSubtitles} from '../content/lib/subtitles.js';
import {getVideoLang} from '../content/lib/metadata.js';
import {waitForElt} from '../content/lib/utils.js';

describe('caption migration', () => {
  it('waits for mobile playback initialization via a src attribute change',
    async () => {
      const video = document.createElement('video');
      document.body.append(video);
      const controller = new AbortController();
      const pending = waitForElt('video[src]', controller.signal, 0);
      video.setAttribute('src', 'blob:fixture');
      await expect(pending).resolves.toBe(video);
      controller.abort();
      video.remove();
    });
  it('normalizes segments and respects gaps and seeks', () => {
    const cues = parseCaptions({events: [
      {tStartMs: 0},
      {tStartMs: 1000, dDurationMs: 1000,
        segs: [{utf8: 'Hello\n'}, {utf8: 'world'}]},
      {tStartMs: 3000, dDurationMs: 1000, segs: [{utf8: 'Again'}]},
    ]});
    expect(activeCaption(cues, 1.5)?.text).toBe('Hello world');
    expect(activeCaption(cues, 2)).toBeUndefined();
    expect(activeCaption(cues, 3.5)?.text).toBe('Again');
    expect(activeCaption(cues, 1)?.text).toBe('Hello world');
  });

  it('prefers manual captions regardless of display-name length', () => {
    const tracks = [
      {languageCode: 'de', kind: 'asr', name: {simpleText: 'DE'}},
      {languageCode: 'de', name: {simpleText: 'German manual captions'}},
    ] as YTCaptionTrack[];
    expect(getPreferredCaptionTrack(tracks, 'de')).toBe(tracks[1]);
  });

  it('extracts the original audio language with a base UI locale', () => {
    document.documentElement.lang = 'en';
    const metadata = {
      captions: {playerCaptionsTracklistRenderer: {
        captionTracks: [{languageCode: 'en'}, {languageCode: 'de'}],
        audioTracks: [{captionTrackIndices: [0]}, {captionTrackIndices: [1]}],
      }},
      streamingData: {adaptiveFormats: [
        {audioTrack: {displayName: 'English', id: 'en.0'}},
        {audioTrack: {displayName: 'German (Original)', id: 'de.4'}},
      ]},
    } as YTVideoMetadataWithCaptions;
    expect(getVideoLang(metadata)).toBe('de');
    document.documentElement.lang = 'unknown';
    expect(getVideoLang(metadata)).toBeUndefined();
  });

  it('updates both caption lines before a paused seek finishes', () => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const player = document.createElement('div');
    const video = document.createElement('video');
    player.append(video);
    document.body.append(player);
    const controller = new AbortController();
    const updateTranslation = renderSubtitles(player, video, [
      {start: 0, end: 10, text: 'Erste Zeile'},
      {start: 10, end: 20, text: 'Zweite Zeile'},
    ], 'de', controller.signal);
    updateTranslation([
      {start: 0, end: 10, text: 'First line'},
      {start: 10, end: 20, text: 'Second line'},
    ]);
    try {
      expect(video.paused).toBe(true);
      expect(player.querySelector('.original-subtitle')?.textContent)
        .toBe('Erste Zeile');
      video.currentTime = 15;
      // No seeked/timeupdate or animation frame arrives until media resumes.
      video.dispatchEvent(new Event('seeking'));
      expect(player.querySelector('.original-subtitle')?.textContent)
        .toBe('Zweite Zeile');
      expect(player.querySelector('.translated-subtitle')?.textContent)
        .toBe('Second line');
    } finally {
      controller.abort();
      player.remove();
    }
  });

  it('renders stationary words, handles seeking and cleans up on navigation',
    () => {
      global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      const player = document.createElement('div');
      const video = document.createElement('video');
      player.append(video);
      document.body.append(player);
      const controller = new AbortController();
      const updateTranslation = renderSubtitles(player, video, [
        {start: 0, end: 1, text: 'Hallo Welt'},
        {start: 2, end: 3, text: 'Noch einmal'},
      ], 'de', controller.signal);
      expect(player.querySelectorAll('.subtitle-word')).toHaveLength(2);
      updateTranslation([{start: 0, end: 1, text: 'Hello world'}]);
      expect(player.querySelector('.translated-subtitle')?.textContent)
        .toBe('Hello world');
      video.currentTime = 1.5;
      video.dispatchEvent(new Event('seeked'));
      expect(player.querySelectorAll('.subtitle-word')).toHaveLength(0);
      video.currentTime = 2.5;
      video.dispatchEvent(new Event('seeked'));
      expect(player.querySelector('.original-subtitle')?.textContent)
        .toBe('Noch einmal');
      controller.abort();
      expect(player.querySelector('.subtitle-container')).toBeNull();
      expect(player.querySelector('video')).toBe(video);
      player.remove();
    });
});

describe('translateWord', () => {
  it('does not try other translators when the extension context is invalid',
    async () => {
      const sendMessage = jest.fn().mockRejectedValue(
        new Error('Extension context invalidated.'),
      );
      global.chrome = {runtime: {sendMessage}} as unknown as typeof chrome;
      await expect(translateWord(['Hallo'], 0, 'de'))
        .rejects.toThrow('Refresh this YouTube page to reconnect');
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
  it('falls back when the preferred context translator rejects a request',
    async () => {
      const sendMessage = jest.fn().mockImplementation((request) => {
        if (request.translator === 'deepL') {
          return Promise.resolve({type: 'error', name: 'Error',
            message: 'DeepL client no longer supported'});
        }
        return Promise.resolve({type: 'translation',
          translation: request.translator === 'bing' ?
            '<b>Hello</b>' : 'Hello'});
      });
      global.chrome = {runtime: {sendMessage}} as unknown as typeof chrome;
      await expect(translateWord(['Hallo', 'Welt'], 0, 'de'))
        .resolves.toBe('Hello');
      expect(sendMessage.mock.calls.map(([request]) => request.translator))
        .toEqual(['google', 'deepL', 'bing']);
    });
  it('removes terminal punctuation', () => {
    expect(removePunctuation('word.')).toBe('word');
    expect(removePunctuation('')).toBe('');
  });

  it('escapes translator HTML before inserting it into bubbles', () => {
    expect(escapeHTML('<img src=x onerror=alert(1)>'))
      .toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('sends only one request for a single-word sentence', async () => {
    const sendMessage = jest.fn().mockResolvedValue({
      type: 'translation', translation: 'Hello',
    });
    global.chrome = {runtime: {sendMessage}} as unknown as typeof chrome;
    await expect(translateWord(['Hallo'], 0, 'de')).resolves.toBe('Hello');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
