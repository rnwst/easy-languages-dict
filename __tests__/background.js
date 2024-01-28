'use strict';

import googleTranslate from '../background/lib/translators/googleTranslate.js';
import bingTranslate from '../background/lib/translators/bingTranslate.js';
import * as utils from '../background/lib/utils.js';


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
    jest.spyOn(utils, 'getStoredData').mockImplementation(() => {
      return Promise.resolve();
    });

    jest.spyOn(utils, 'storeData').mockImplementation(() => {
      return Promise.resolve();
    });

    it('fetches auth data only once', async () => {
      // `fetchAuthData` prints to debug console when it is called.
      const consoleMock = jest.spyOn(console, 'debug').mockImplementation();
      const fetchSpy = jest.spyOn(window, 'fetch');
      await Promise.all([
        bingTranslate('a', {from: 'en', to: 'de'}),
        bingTranslate('b', {from: 'en', to: 'de'}),
      ]);
      expect(consoleMock).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      consoleMock.mockRestore();
      fetchSpy.mockRestore();
    });

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
