'use strict';

import * as fs from 'fs';

import {removePunctuation} from '../content/translateWord.js';
import {getLang, langSupported} from '../content/utils.js';


describe('utils', () => {
  describe('getLang', () => {
    it('extracts language from video title', () => {
      const channelTitleLanguagePairs = [
        ['Easy Japanese 19 - Slang words', 'japanese'],
        ['Learning Thai Numbers | Super Easy Thai 2', 'thai'],
        ['Christmas in Taiwan | Easy Taiwanese Mandarin 15', 'mandarin'],
      ];
      channelTitleLanguagePairs.forEach((pair) => {
        jest.spyOn(document, 'querySelector').mockImplementation(() => {
          return {textContent: pair[0]};
        });
        expect(getLang()).toEqual(pair[1]);
        jest.restoreAllMocks();
      });
    });
  });

  describe('langSupported', () => {
    global.chrome = {
      runtime: {
        getURL: () => '',
      },
    };
    global.fetch = () => Promise.resolve({
      text: () => fs.readFileSync('langs.csv').toString(),
    });

    it('says Polish is supported', async () => {
      jest.spyOn(document, 'querySelector').mockImplementation(() => {
        return {textContent: 'Easy Polish 1'};
      });
      expect(await langSupported()).toEqual(true);
    });
    // A language which appears in `langs.csv`.
    it('says Oshiwambo isn\'t supported', async () => {
      jest.spyOn(document, 'querySelector').mockImplementation(() => {
        return {textContent: 'Easy Oshiwambo 1'};
      });
      expect(await langSupported()).toEqual(false);
    });
    // A language which doesn't appear in `langs.csv`.
    it('says Sindarin isn\'t supported', async () => {
      jest.spyOn(document, 'querySelector').mockImplementation(() => {
        return {textContent: 'Easy Sindarin 1'};
      });
      expect(await langSupported()).toEqual(false);
    });
    jest.restoreAllMocks();
  });
});


describe('translateWord', () => {
  describe('removePunctuation', () => {
    it('removes punctuation', () => {
      expect(removePunctuation('word.')).toEqual('word');
      expect(removePunctuation('word,')).toEqual('word');
      expect(removePunctuation('word?')).toEqual('word');
    });
    it('returns word without punctuation unmodified', () => {
      expect(removePunctuation('word')).toEqual('word');
    });
    it('leaves empty string empty', () => {
      expect(removePunctuation('')).toEqual('');
    });
  });
});
