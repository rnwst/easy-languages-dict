import {getVideoLang} from '../content/lib/metadata.js';

/** Video information captured from Z9PRhksKFqU (Polish bike ride).
 * English is the default caption, but only Polish has automatic captions.
 */
function bikeRide(): YTVideoMetadataWithCaptions {
  return {
    videoDetails: {videoId: 'Z9PRhksKFqU',
      title: 'Learn Polish naturally on a Bike Ride (Comprehensible Input)',
      channelId: '', author: ''},
    streamingData: {adaptiveFormats: []},
    captions: {playerCaptionsTracklistRenderer: {
      captionTracks: ['en', 'fr', 'de', 'it', 'pl', 'pl', 'pt', 'ru',
        'es', 'tr', 'uk'].map((languageCode, index) => ({
        languageCode, ...(index === 5 ? {kind: 'asr'} : {}),
        baseUrl: 'https://www.youtube.com/api/timedtext?v=Z9PRhksKFqU' +
          `&lang=${languageCode}`,
        name: {simpleText: languageCode}, isTranslatable: true,
      })),
      audioTracks: [{captionTrackIndices: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 5],
        defaultCaptionTrackIndex: 0}],
    }},
  } as YTVideoMetadataWithCaptions;
}

describe('original video language', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en-GB';
  });

  it('recognizes Polish despite English being the default caption', () => {
    expect(getVideoLang(bikeRide())).toBe('pl');
  });

  it('does not depend on ordering translated caption tracks', () => {
    const metadata = bikeRide();
    metadata.captions.playerCaptionsTracklistRenderer.captionTracks.reverse();
    expect(getVideoLang(metadata)).toBe('pl');
  });

  it('does not let one associated manual translation override ASR evidence',
    () => {
      const metadata = bikeRide();
      metadata.captions.playerCaptionsTracklistRenderer.audioTracks[0]
        .captionTrackIndices = [0];
      expect(getVideoLang(metadata)).toBe('pl');
    });

  it('does not guess from multiple manual translations without audio evidence',
    () => {
      const metadata = bikeRide();
      delete metadata.captions.playerCaptionsTracklistRenderer.captionTracks[5]
        .kind;
      expect(getVideoLang(metadata)).toBeUndefined();
    });

  it('prefers a labelled original over captions associated with a dubbed track',
    () => {
      const metadata = bikeRide();
      metadata.streamingData.adaptiveFormats = [
        {audioTrack: {id: 'en.4', displayName: 'English (Original)'}},
        {audioTrack: {id: 'pl.0', displayName: 'Polish'}},
      ];
      metadata.captions.playerCaptionsTracklistRenderer.audioTracks[0]
        .audioTrackId = 'pl.0';
      expect(getVideoLang(metadata)).toBe('en');
    });
});
