'use strict';

import * as fs from 'fs';

import {parseCSV} from '../content/readLangsDotCSV.js';
import {removePunctuation} from '../content/translateWord.js';


describe('getLang', () => {
  global.chrome = {
    runtime: {
      getURL: () => '',
    },
  };

  global.fetch = () => Promise.resolve({
    text: () => fs.readFileSync('langs.csv').toString(),
  });

  jest.mock('../content/getVideoMetadata.js', () => {
    return Promise.resolve({
      channelHandle: '',
      title: '',
    });
  });

  // Need to import function using `require` after `getVideoMetadata` has been
  // mocked, as it is executed on import.
  const {extractLangFromTitle} = require('../content/getLang.js');

  describe('extractLangFromTitle', () => {
    it('extracts language from video title', () => {
      const channelTitleLanguagePairs = [
        ['Easy Japanese 19 - Slang words', 'japanese'],
        ['Learning Thai Numbers | Super Easy Thai 2', 'thai'],
        ['Christmas in Taiwan | Easy Taiwanese Mandarin 15', 'mandarin'],
      ];
      channelTitleLanguagePairs.forEach((pair) => {
        expect(extractLangFromTitle(pair[0])).toEqual(pair[1]);
        jest.restoreAllMocks();
      });
    });
  });
});


describe('readLangsDotCSV', () => {
  describe('parseCSV', () => {
    it('parses CSV', () => {
      const csv =
        'name,iso,defaultEngine\n' +
        'sindarin,sjn,elvishTranslator\n' +
        'quenya,qya,elvishTranslator\n';
      const parsed = [
        {
          name: 'sindarin',
          iso: 'sjn',
          defaultEngine: 'elvishTranslator',
        },
        {
          name: 'quenya',
          iso: 'qya',
          defaultEngine: 'elvishTranslator',
        },
      ];
      expect(parseCSV(csv)).toEqual(parsed);
    });
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
