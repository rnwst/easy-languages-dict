import deepL from '../../../../background/lib/translators/deepL.js';

describe('DeepL (live)', () => {
  it('translates sentences into different languages', async () => {
    const translations = await Promise.all([
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
    ]);
    expect(translations[0]).toMatch(/\p{Script=Han}/u);
    expect(translations[1]).toMatch(/iglous|igloos/i);
    expect(translations[2]).toMatch(/legwan|iguan/i);
  });

  it('translates', async () => {
    const translation = await deepL({
      text: 'Hello',
      langCodes: {from: 'EN', to: 'DE'},
    });
    expect(translation).toEqual('Hallo');
  });

  it('preserves the translated word’s context tags', async () => {
    const translation = await deepL({
      text: 'Ich sitze auf der <b>Bank</b> am Fluss.',
      langCodes: {from: 'DE', to: 'EN-GB'},
    });
    expect(translation).toMatch(/<b>bench<\/b>/i);
  });
});
