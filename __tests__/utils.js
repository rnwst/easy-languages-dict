'use strict';

import {parseCSV} from '../utils/getLangData.js';


describe('langInfo', () => {
  describe('parseCSV', () => {
    it('parses CSV', () => {
      const csv =
        'lang,iso,defaultEngine\n' +
        'sindarin,sjn,elvishTranslator\n' +
        'quenya,qya,elvishTranslator\n';
      const parsed = {
        sindarin: {
          iso: 'sjn',
          defaultEngine: 'elvishTranslator',
        },
        quenya: {
          iso: 'qya',
          defaultEngine: 'elvishTranslator',
        },
      };
      expect(parseCSV(csv)).toEqual(parsed);
    });
  });
});
