import type { BuildOptions, Plugin } from 'esbuild';

declare global {
  type ManifestV2 = chrome.runtime.ManifestV2;

  type ManifestV3 =
    chrome.runtime.ManifestV3 & {
      background?: NonNullable<chrome.runtime.ManifestV3['background']> & {
        scripts?: string[];
      };
    };

  type ESBuildPlugin = Plugin;
  type ESBuildOptions = BuildOptions;

  type Browser =
    | 'chromium'
    | 'edge'
    | 'firefox'
    | 'firefox-desktop'
    | 'firefox-android'
}

export {};
