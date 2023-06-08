'use strict';

import googleTranslate from '../background/googleTranslate.js';
import bingTranslate from '../background/bingTranslate.js';


describe('translators', () => {
  describe('googleTranslate', () => {
    it('translates', async () => {
      const translation = await googleTranslate(
          'Hello',
          {
            from: 'en',
            to: 'de',
          },
      );
      expect(translation).toEqual('Hallo');
    });
  });

  describe('bingTranslate', () => {
    it('translates', async () => {
      const translation = await bingTranslate(
          'Hello',
          {
            from: 'en',
            to: 'de',
          },
      );
      expect(translation).toEqual('Hallo');
    });
  });
});
