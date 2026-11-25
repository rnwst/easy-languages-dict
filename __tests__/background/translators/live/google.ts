import googleTranslate from
  '../../../../background/lib/translators/googleTranslate.js';

describe('Google Translate (live)', () => {
  it('translates', async () => {
    const translation = await googleTranslate({
      text: 'Hello',
      langCodes: {from: 'en-GB', to: 'de'},
    });
    expect(translation).toEqual('Hallo');
  });
});
