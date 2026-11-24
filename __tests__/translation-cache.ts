import respond from '../background/lib/respondToTranslationRequest.js';
import google from '../background/lib/translators/googleTranslate.js';
import bing from '../background/lib/translators/bingTranslate.js';
import {JSONSerializable} from '../types.js';

jest.mock('../background/lib/translators/googleTranslate.js', () => ({
  __esModule: true, default: jest.fn().mockResolvedValue('Google result'),
}));
jest.mock('../background/lib/translators/bingTranslate.js', () => ({
  __esModule: true, default: jest.fn().mockResolvedValue('Bing result'),
}));

it('caches identical text independently for each translator', async () => {
  const request = (translator: 'google' | 'bing') =>
    new Promise<JSONSerializable>((resolve) => {
      respond({translator, text: 'Hallo', langCodes: {from: 'de', to: 'fr'}},
        undefined, resolve);
    });
  await expect(request('google')).resolves.toMatchObject({
    translation: 'Google result',
  });
  await expect(request('bing')).resolves.toMatchObject({
    translation: 'Bing result',
  });
  await request('google');
  expect(google).toHaveBeenCalledTimes(1);
  expect(bing).toHaveBeenCalledTimes(1);
});
