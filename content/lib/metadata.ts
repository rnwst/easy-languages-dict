import {YTLanguageCode} from '../../types.js';
import {ytLanguageCodes} from '../../lang-codes.js';
import {waitForMessage} from './messages.js';

const metadataMap: Record<VideoId, YTVideoMetadata> = {};

export function registerMetadataListener(
  onMetadata?: (metadata: YTVideoMetadata) => void,
) {
  addEventListener('message', (evt) => {
    const msg = evt.data as (VideoMetadataMsg | unknown);
    if (
      evt.source === window && evt.origin === location.origin &&
      msg && typeof msg === 'object' &&
      'origin' in msg && msg.origin === 'EASY_LANGUAGES_DICT_EXT' &&
      'type' in msg && msg.type === 'VIDEO_METADATA'
    ) {
      const metadata = (msg as VideoMetadataMsg).content;
      const videoId = metadata?.videoDetails?.videoId;
      if (!videoId) return;
      metadataMap[videoId] = metadata;
      const keys = Object.keys(metadataMap);
      if (keys.length > 10) delete metadataMap[keys[0]];
      onMetadata?.(metadata);
    }
  });
}

export async function getVideoMetadata(
  videoId: string, signal: AbortSignal,
):
  Promise<YTVideoMetadata> {
  signal.throwIfAborted();
  if (metadataMap[videoId]) return metadataMap[videoId];
  const pending = waitForMessage<YTVideoMetadata>('VIDEO_METADATA', signal,
    (value) => value?.videoDetails?.videoId === videoId);
  const request = () => postMessage({origin: 'EASY_LANGUAGES_DICT_EXT',
    type: 'VIDEO_METADATA_REQUEST', videoId}, location.origin);
  // YouTube's initial video information may not be ready yet. A later download
  // may also finish before this script starts listening. Ask the page-side
  // script for what the player currently knows, including its saved responses.
  const timer = setInterval(request, 500);
  request();
  try {
    return await pending;
  } finally {
    clearInterval(timer);
  }
}

/** Infer the spoken language from original-audio information or YouTube's
 * automatically generated captions. The first/default caption may instead be
 * a translation, so its position in the list does not tell us what was spoken.
 */
export function getVideoLang(metadata: YTVideoMetadataWithCaptions):
    YTLanguageCode | undefined {
  const captionTracks =
      metadata.captions.playerCaptionsTracklistRenderer.captionTracks;
  const audioTracks =
      metadata.captions.playerCaptionsTracklistRenderer.audioTracks ?? [];
  // YouTube labels the original audio in its menus. Look for that label before
  // guessing from captions. The label follows the site's interface language:
  // for example, "original" in English and "oryginalny" in Polish. The audio
  // track's ID then supplies the language code.
  const audioTracks2 = (metadata.streamingData?.adaptiveFormats ?? [])
    .filter((fmt) => Object.prototype.hasOwnProperty.call(fmt, 'audioTrack'))
    .map((fmt) => fmt.audioTrack);
  // The following table is partially AI-generated. I haven't cross-checked all
  // translations here, so mistakes may be present. However, this only impacts
  // users of languages with incorrect translations, and only if they are
  // watching videos with multiple audio tracks, which should be a small subset
  // of all users.
  const originalTranslations: Record<string, string> = {
    af: 'oorspronklik',
    'am-ET': 'የመጀመሪያ',
    ar: 'أصليّ',
    'as-IN': 'মূল',
    'az-Latn-AZ': 'orijinal',
    'be-BY': 'арыгінальны',
    'bg-BG': 'оригинален',
    'bn-BD': 'মূল',
    'bs-Latn-BA': 'originalan',
    'ca-ES': 'original',
    'cs-CZ': 'originální',
    'da-DK': 'original',
    'de-DE': 'original',
    'el-GR': 'πρωτότυπος',
    'en-GB': 'original',
    'en-IN': 'original',
    'en-US': 'original',
    'es-419': 'original',
    'es-ES': 'original',
    'es-US': 'original',
    'et-EE': 'originaalne',
    'eu-ES': 'jatorrizko',
    'fa-IR': 'اصلی',
    'fil-PH': 'orihinal',
    'fr-CA': 'originale',
    'fr-FR': 'original',
    'gl-ES': 'orixinal',
    'gu-IN': 'મૂળભૂત',
    'he-IL': 'מקורי',
    'hi-IN': 'मूल',
    'hr-HR': 'izvorno',
    'hu-HU': 'eredeti',
    'hy-AM': 'բնօրինակ',
    'id-ID': 'asli',
    'is-IS': 'upprunalegt',
    'it-IT': 'originale',
    'ja-JP': 'オリジナル',
    'ka-GE': 'ორიგინალური',
    'kk-KZ': 'түпнұсқа',
    'km-KH': 'ដើម',
    'kn-IN': 'ಮೂಲ',
    'ko-KR': '원본',
    'ky-KG': 'түп нуска',
    'lo-LA': 'ຕົ້ນສະບັບ',
    'lt-LT': 'pradinis',
    'lv-LV': 'oriģināls',
    'mk-MK': 'оригинален',
    'ml-IN': 'അസൽ',
    'mn-MN': 'эх',
    'mr-IN': 'मूळ',
    'ms-MY': 'asal',
    'my-MM': 'မူလ',
    'nb-NO': 'original',
    'ne-NP': 'मौलिक',
    'nl-NL': 'originele',
    'or-IN': 'ମୂଳ',
    'pa-Guru-IN': 'ਅਸਲ',
    'pl-PL': 'oryginalny',
    'pt-BR': 'original',
    'pt-PT': 'original',
    'ro-RO': 'original',
    'ru-RU': 'оригинальный',
    'si-LK': 'මුල්',
    'sq-AL': 'origjinale',
    'sr-Cyrl-RS': 'оригиналан',
    'sw-TZ': 'halisi',
    'ta-IN': 'அசல்',
    'te-IN': 'అసలైన',
    'th-TH': 'ดั้งเดิม',
    'tr-TR': 'orijinal',
    'uk-UA': 'оригінальний',
    'ur-PK': 'اصلی',
    'uz-Latn-UZ': 'original',
    'vi-VN': 'nguyên bản',
    'zh-Hans-CN': '原始的',
    'zh-Hant-HK': '原始的',
    'zh-Hant-TW': '原始的',
    'zu-ZA': 'yokuqala',
  };
  const lang = document.documentElement.lang.toLowerCase() || 'en-us';
  const originalTranslation = Object.entries(originalTranslations).find(
    ([key]) => key.toLowerCase() === lang
  )?.[1] ?? Object.entries(originalTranslations).find(
    ([key]) => key.split('-')[0] === lang.split('-')[0]
  )?.[1];
  const originalAudioTracks = originalTranslation ? audioTracks2.filter(
    (track) => typeof track?.displayName === 'string' &&
      track.displayName.toLocaleLowerCase()
        .includes(originalTranslation.toLocaleLowerCase())
  ) : [];
  // IDs use a language tag followed by a dot and track index (e.g. de.4).
  const original = languageCode(originalAudioTracks[0]?.id?.split('.')[0]);
  if (original) return original;
  if (audioTracks.length === 1) {
    const code = languageCode(audioTracks[0].audioTrackId?.split('.')[0]);
    if (code) return code;
    const associated = audioTracks[0].captionTrackIndices.flatMap(
      (index) => captionTracks[index] ? [captionTracks[index]] : [],
    );
    const automatic = associated.filter((track) => track.kind === 'asr');
    if (automatic.length) return captionLanguage(automatic);
  }
  // With multiple audio tracks, a caption can belong to a dub. Without an
  // identifiable original track, avoid declaring that dub the original.
  return audioTracks.length <= 1 ? captionLanguage(captionTracks) : undefined;
}

function captionLanguage(tracks: YTCaptionTrack[]): YTLanguageCode | undefined {
  const automatic = tracks.filter((track) => track.kind === 'asr');
  const candidates = automatic.length ? automatic : tracks;
  const languages = new Set(candidates.map((track) =>
    languageCode(track.languageCode)));
  return languages.size === 1 ? languages.values().next().value : undefined;
}

function languageCode(value: string | undefined): YTLanguageCode | undefined {
  if (value && /^en(?:-|$)/i.test(value)) return 'en';
  return ytLanguageCodes.find((code) => code === value);
}
