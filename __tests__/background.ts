import googleTranslate from '../background/lib/translators/googleTranslate.js';
import bingTranslate from '../background/lib/translators/bingTranslate.js';
import deepL from '../background/lib/translators/deepL.js';
import * as utils from '../background/lib/utils.js';


describe('translators', () => {
  // By default, jsdom uses the user agent
  // 'Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/20.0.3'.
  // It seems to work fine, but I think it's safest to match the typical browser
  // as closely as possible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global.navigator as any).__defineGetter__('userAgent', () => {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  });

  describe('googleTranslate', () => {
    it('translates', async () => {
      const translation = await googleTranslate({
        text: 'Hello',
        langCodes: {
          from: 'en-GB',
          to: 'de',
        },
      });
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
        bingTranslate({text: 'a', langCodes: {from: 'en', to: 'de'}}),
        bingTranslate({text: 'b', langCodes: {from: 'en', to: 'de'}}),
      ]);
      expect(consoleMock).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      consoleMock.mockRestore();
      fetchSpy.mockRestore();
    });

    it('translates', async () => {
      const translation = await bingTranslate({
        text: 'Hello',
        langCodes: {
          from: 'en',
          to: 'de',
        },
      });
      expect(translation).toEqual('Hallo');
    });
  });

  describe('deepL', () => {
    it('translates sentence with lots of \'i\'s', async () => {
      await expect(Promise.all([
        deepL({
          text: 'iguanas ingest insects',
          langCodes: {from: 'EN', to: 'ZH'},
        }),
        deepL({
          text: 'icy igloos invite imagination',
          langCodes: {from: 'EN', to: 'FR'},
        }),
        deepL({
          text: 'incredible iguanas illuminate intricate, imaginary islands',
          langCodes: {from: 'EN', to: 'PL'},
        }),
      ])).resolves.toBeTruthy();
    });

    it('translates', async () => {
      const translation = await deepL({
        text: 'Hello',
        langCodes: {
          from: 'EN',
          to: 'DE',
        },
      });
      expect(translation).toEqual('Hallo');
    });
  });
});
