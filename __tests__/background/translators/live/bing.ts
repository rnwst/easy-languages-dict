import bingTranslate from
  '../../../../background/lib/translators/bingTranslate.js';
import * as utils from '../../../../background/lib/utils.js';

describe('Bing Translate (live)', () => {
  beforeEach(() => {
    jest.spyOn(utils, 'getStoredData').mockResolvedValue(undefined);
    jest.spyOn(utils, 'storeData').mockResolvedValue(undefined);
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('translates', async () => {
    const translation = await bingTranslate({
      text: 'Hello',
      langCodes: {from: 'en', to: 'de'},
    });
    expect(translation).toEqual('Hallo');
  });
});
