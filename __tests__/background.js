'use strict';

import googleTranslate from '../background/lib/translators/googleTranslate.js';
import bingTranslate from '../background/lib/translators/bingTranslate.js';
import deepL from '../background/lib/translators/deepL.js';
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

  describe('deepL', () => {
    it('translates sentence with lots of \'i\'s', async () => {
      await expect(Promise.all([
        deepL(
            'iguanas ingest insects',
            {from: 'EN', to: 'ZH'},
        ),
        deepL(
            'icy igloos invite imagination',
            {from: 'EN', to: 'FR'},
        ),
        deepL(
            'incredible iguanas illuminate intricate, imaginary islands',
            {from: 'EN', to: 'PL'},
        ),
      ])).resolves.toBeTruthy();
    });

    it('translates', async () => {
      const translation = await deepL(
          'Hello',
          {
            from: 'EN',
            to: 'DE',
          },
      );
      expect(translation).toEqual('Hallo');
    });
  });
});
