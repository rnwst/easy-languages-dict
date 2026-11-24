type VideoId = string;

type YTCaptionTrack = {
  baseUrl: string;
  name: {
    simpleText: string;
  };
  languageCode: string;
  kind?: 'asr';
  isTranslatable: boolean;
}

/**
 * A subset of the data from the player API response.
 */
type YTVideoMetadata = {
  videoDetails: {
    videoId: VideoId;
    title: string;
    channelId: string;
    author: string;
  }
  streamingData: {
    adaptiveFormats: Array<{
      audioTrack?: {
        displayName: string;
        id: string;
      }
    }>;
  };
  captions?: {
    playerCaptionsTracklistRenderer: {
      captionTracks: Array<YTCaptionTrack>;
      audioTracks: Array<{
        captionTrackIndices: Array<number>;
        defaultCaptionTrackIndex?: number;
        audioTrackId?: string;
      }>;
    };
  };
}

type YTVideoMetadataWithCaptions =
  YTVideoMetadata & { captions: NonNullable<YTVideoMetadata['captions']>};

type VideoMetadataMsg = {
  origin: 'EASY_LANGUAGES_DICT_EXT';
  type: 'VIDEO_METADATA';
  content: YTVideoMetadata;
}

type CaptionRequest = {
  id: number;
  params: Record<string, string>;
  headers: Record<string, string>;
  startedAt: number;
};

type CaptionResponse = CaptionRequest & {
  status: number;
  body: string;
  outcome: 'load' | 'error' | 'abort' | 'timeout';
};

type CaptionReplayResponse = {
  operationId: string;
  status: number;
  body: string;
  error?: string;
};
