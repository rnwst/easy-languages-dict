import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildFixtures, launch, install, translations} from './harness.js';
import {fixture, watchURL} from './fixture.js';

let artifacts;
let productionBrowser;
let productionExtension;
const fixtureTranslation =
  'a deliberately long translation to exercise bubble edge clamping';

before(async () => {
  artifacts = await buildFixtures();
  productionBrowser = await launch(artifacts.directory);
  productionExtension = await install(productionBrowser, artifacts.production);
  await translations(productionExtension.worker, fixtureTranslation);
}, {timeout: 120000});

after(async () => {
  await productionBrowser?.close();
  if (artifacts) {
    await fs.rm(artifacts.directory, {recursive: true, force: true});
  }
});

async function healthy(f) {
  assert.deepEqual(f.errors, []);
  assert(!f.logs.some(line => line.includes('Extension context invalidated')));
  const count = await f.page.$$eval('.subtitle-container',
    nodes => nodes.length);
  assert.equal(count, 1, 'Exactly one subtitle UI');
}

test('production startup races use native responses', {concurrency: 3},
  async t => {
    await Promise.all(['normal', 'late-metadata', 'early-metadata',
      'late-caption-metadata', 'player-snapshot', 'cached-native',
      'late-controls', 'tokenless', 'fresh-signature',
      'synchronous-abort'].map(scenario =>
      t.test(scenario, {timeout: 20000}, async t => {
        const f = await fixture(productionBrowser, t, {scenario});
        await f.open();
        await f.mounted();
        await healthy(f);
        assert.equal(f.documents(), 1, 'Production must not reload the page');
        assert(f.requests.length > 0);
        const messages = await f.page.evaluate(() => window.fixtureMessages);
        assert(messages.includes('CAPTION_REQUEST'));
        assert(messages.includes('CAPTION_RESPONSE'));
        if (scenario === 'tokenless') {
          assert(f.requests.every(request => !request.pot));
        }
        if (scenario === 'cached-native') {
          assert.equal(f.requests.length, 1, 'Reuse the early native response');
        }
        if (scenario === 'fresh-signature') {
          assert(f.requests.every(request => request.signature === 'fresh'));
          assert(f.requests.some(request => request.lang === 'en'));
          assert(f.requests.some(request => request.lang === 'de'));
        }
      })));
  });

test('a trusted manual CC click recovers after the startup deadline',
  {timeout: 40000}, async t => {
    const f = await fixture(productionBrowser, t, {scenario: 'late-manual'});
    await f.open();
    await f.startupFailed;
    assert.equal(await f.page.$('.subtitle-container'), null);
    await f.page.evaluate(() => window.manualRecovery = true);
    if (await f.page.$eval('.ytp-subtitles-button', button =>
      button.getAttribute('aria-pressed') === 'true')) {
      await f.page.click('.ytp-subtitles-button');
    }
    await f.page.click('.ytp-subtitles-button');
    await f.mounted();
    assert(f.requests.some(request => request.manual === '1'));
    await healthy(f);
  });

for (const scenario of ['panel-empty', 'panel-timeout']) {
  test(`${scenario} renders interactive Polish and English panel captions`,
    {timeout: 40000}, async t => {
      const f = await fixture(productionBrowser, t, {scenario, panel: true,
        language: 'pl', existingEnglish: true});
      await f.open();
      await f.page.evaluate(() => {
        document.querySelector('video').currentTime = 89.8;
      });
      await f.page.waitForFunction(() =>
        document.querySelector('.translated-subtitle')?.textContent ===
          'I really like riding a bike.', {timeout: 35000});
      assert.equal(await f.page.$eval('.original-subtitle', n => n.textContent),
        'Ja bardzo lubię jeździć na rowerze.');
      await f.page.$eval('.subtitle-word', button => button.click());
      await f.page.waitForFunction(expected =>
        document.querySelector('.translation-bubble')?.textContent === expected,
      {}, fixtureTranslation);
      assert.equal(f.panelRequests.length, 2);
      assert.equal(await f.page.$eval('.ytp-subtitles-button', button =>
        button.getAttribute('aria-pressed')), 'false');
      await healthy(f);
      await f.page.evaluate(() => {
        document.dispatchEvent(new Event('yt-navigate-start'));
      });
      await f.page.waitForFunction(() =>
        !document.querySelector('.subtitle-container'));
    });
}

test('native captions bypass the available panel fallback', async t => {
  const f = await fixture(productionBrowser, t, {panel: true,
    existingEnglish: true});
  await f.open();
  await f.mounted();
  await f.page.waitForFunction(() =>
    document.querySelector('.translated-subtitle')?.textContent ===
      'Hello world');
  assert.equal(f.panelRequests.length, 0);
  await healthy(f);
});

for (const panelEnglishStatus of [200, 500]) {
  test(`native source survives English fallback ${panelEnglishStatus}`,
    async t => {
      const f = await fixture(productionBrowser, t, {panel: true,
        existingEnglish: true, emptyEnglish: true, panelEnglishStatus});
      await f.open();
      await f.mounted();
      await f.page.evaluate(() => {
        document.querySelector('video').currentTime = 89.8;
        document.querySelector('video').dispatchEvent(new Event('timeupdate'));
      });
      if (panelEnglishStatus === 200) {
        await f.page.waitForFunction(() =>
          document.querySelector('.translated-subtitle')?.textContent ===
            'I really like riding a bike.');
      } else {
        await f.page.waitForFunction(() => window.fixtureMessages
          .includes('TRANSCRIPT_PANEL_RESPONSE'));
      }
      assert.equal(f.panelRequests.length, 1);
      assert(Buffer.from(f.panelRequests[0].params, 'base64').includes('.en'));
      // Return to the native fixture's timeline to exercise the source UI.
      await f.page.evaluate(() => {
        document.querySelector('video').currentTime = 1;
        document.querySelector('video').dispatchEvent(new Event('timeupdate'));
      });
      await f.mounted();
      await healthy(f);
    });
}

test('panel 429 remains bounded across repeated startup events',
  {timeout: 18000}, async t => {
    const f = await fixture(productionBrowser, t, {scenario: 'panel-empty',
      panel: true, language: 'pl', existingEnglish: true, panelStatus: 429});
    await f.open();
    await f.page.waitForFunction(() => window.fixtureMessages
      .includes('TRANSCRIPT_PANEL_RESPONSE'));
    for (let i = 0; i < 3; i++) {
      await f.page.evaluate(() => {
        document.dispatchEvent(new Event('playing'));
      });
      await f.page.evaluate(() => new Promise(r => setTimeout(r, 300)));
    }
    assert.equal(f.panelRequests.length, 1);
    assert.equal(await f.page.$('.subtitle-container'), null);
    assert.deepEqual(f.errors, []);
  });

test('navigation cancels a pending panel and prevents a stale overlay',
  {timeout: 18000}, async t => {
    const f = await fixture(productionBrowser, t, {scenario: 'panel-empty',
      panel: true, language: 'pl', panelDelayed: true});
    await f.open();
    await f.page.waitForFunction(() => window.fixtureMessages
      .includes('TRANSCRIPT_PANEL_REQUEST'));
    await f.page.evaluate(() => {
      document.dispatchEvent(new Event('yt-navigate-start'));
      history.pushState({}, '', '/');
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    f.releasePanel();
    await f.page.waitForFunction(() => window.fixtureMessages
      .includes('TRANSCRIPT_PANEL_CANCEL'));
    assert.equal(await f.page.$('.subtitle-container'), null);
    assert.equal(f.panelRequests.length, 1);
    assert.deepEqual(f.errors, []);
  });

for (const scenario of ['early-empty-native', 'early-reopened-native']) {
  test(`native CC-on startup recovers: ${scenario}`, {timeout: 18000},
    async t => {
      const f = await fixture(productionBrowser, t,
        {initialOn: true, scenario});
      await f.open();
      assert.equal(await f.page.evaluate(() => window.earlyReadyState),
        'loading', 'Native CC must request before isolated document_end');
      await f.mounted();
      assert.equal(await f.page.$eval('.ytp-subtitles-button', button =>
        button.getAttribute('aria-pressed')), 'true');
      assert.equal(f.requests.length, 2, 'One early request, one fresh reload');
      if (scenario === 'early-empty-native') {
        assert(!f.requests[0].pot);
        assert(f.requests[1].pot);
      } else {
        assert.equal(await f.page.evaluate(() => window.reopenAbortEvents), 0,
          'The bridge must not fabricate native abort events');
      }
      await healthy(f);
    });
}

test('native CC-on pending startup is not cancelled or clicked', async t => {
  const f = await fixture(productionBrowser, t,
    {initialOn: true, delayed: true});
  await f.open();
  await f.page.waitForFunction(() =>
    window.fixtureMessages.includes('CAPTION_STATE_REQUEST'));
  await f.page.evaluate(() =>
    new Promise(resolve => setTimeout(resolve, 2500)));
  assert.equal(await f.page.evaluate(() => window.captionClicks), 0);
  f.release();
  await f.mounted();
  assert.equal(f.requests.length, 1);
  assert.equal(await f.page.evaluate(() => window.captionClicks), 0);
  assert.equal(await f.page.$eval('.ytp-subtitles-button', button =>
    button.getAttribute('aria-pressed')), 'true');
  await healthy(f);
});

for (const options of [
  {language: 'en'},
  {language: 'de', audioLanguage: 'en-GB'},
]) {
  const language = options.audioLanguage ?? options.language;
  test(`English source (${language}) skips overlay and acquisition`,
    async t => {
      const f = await fixture(productionBrowser, t, options);
      await f.open();
      await f.page.waitForFunction(() =>
        window.fixtureMessages.includes('VIDEO_METADATA'));
      assert.equal(await f.page.$('.subtitle-container'), null);
      assert.deepEqual(f.requests, []);
      assert(!await f.page.evaluate(() =>
        window.fixtureMessages.includes('CAPTION_STATE_REQUEST')));
      await f.page.click('.ytp-subtitles-button');
      await f.page.waitForFunction(() =>
        window.fixtureMessages.includes('CAPTION_RESPONSE'));
      assert.equal(await f.page.$eval('.ytp-subtitles-button', button =>
        button.getAttribute('aria-pressed')), 'true');
      assert.equal(await f.page.$('.subtitle-container'), null);
      assert(!await f.page.evaluate(() =>
        window.fixtureMessages.includes('CAPTION_STATE_REQUEST')));
    });
}

test('playback, seek, SPA navigation, and bubble geometry', async t => {
  const f = await fixture(productionBrowser, t);
  const {page} = f;
  await f.open();
  await f.mounted();
  for (const edge of ['first', 'last']) {
    await page.$eval(`.subtitle-word:${edge}-of-type`, button => {
      button.click();
    });
    await page.waitForFunction(expected =>
      document.querySelector('.translation-bubble')?.textContent ===
        expected, {}, fixtureTranslation);
    const geometry = await page.evaluate(() => {
      const bubble = document.querySelector('.translation-bubble');
      return {bubble: bubble.getBoundingClientRect().toJSON(),
        word: document.querySelector('.selected').getBoundingClientRect()
          .toJSON(),
        container: document.querySelector('.subtitle-container')
          .getBoundingClientRect().toJSON(),
        color: getComputedStyle(bubble).color,
        backdrop: getComputedStyle(bubble).backdropFilter,
        mask: getComputedStyle(bubble).maskImage};
    });
    assert.equal(geometry.color, 'rgb(238, 238, 238)');
    assert.match(geometry.backdrop, /blur/);
    assert.match(geometry.mask, /conic-gradient/);
    assert(geometry.bubble.left >= geometry.container.left - 1);
    assert(geometry.bubble.right <= geometry.container.right + 1);
    assert(geometry.bubble.bottom < geometry.word.top);
    const margin = edge === 'first' ?
      geometry.bubble.left - geometry.container.left :
      geometry.container.right - geometry.bubble.right;
    assert(margin < 12, 'The wide bubble must actually exercise edge clamping');
  }
  await page.setViewport({width: 480, height: 600});
  await page.waitForFunction(() => {
    const bubble = document.querySelector('.translation-bubble')
      .getBoundingClientRect();
    const container = document.querySelector('.subtitle-container')
      .getBoundingClientRect();
    return bubble.left >= container.left - 1 &&
      bubble.right <= container.right + 1;
  });
  await page.focus('.subtitle-word:last-of-type');
  await page.keyboard.press('Escape');
  assert(await page.$eval('.translation-bubble', bubble => bubble.hidden));
  // Set the video's time and send playback events without downloading media.
  await page.evaluate(() => {
    const video = document.querySelector('video');
    video.currentTime = 12;
    video.dispatchEvent(new Event('play'));
    video.dispatchEvent(new Event('timeupdate'));
  });
  await page.waitForFunction(() =>
    document.querySelector('.original-subtitle')?.textContent ===
      'Zweite Zeile');
  await page.evaluate(() => {
    document.querySelector('video').currentTime = 9;
    document.querySelector('video').dispatchEvent(new Event('seeked'));
  });
  await page.waitForSelector('.subtitle-word:nth-of-type(3)');
  await page.evaluate(() => {
    history.pushState({}, '', '/');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForFunction(() =>
    !document.querySelector('.subtitle-container'));
  await page.evaluate(url => {
    history.pushState({}, '', url);
    document.dispatchEvent(new Event('yt-navigate-finish'));
  }, watchURL);
  await f.mounted();
  await healthy(f);
});

test('trusted native CC toggles stay independent after mounting', async t => {
  const f = await fixture(productionBrowser, t, {initialOn: true});
  await f.open();
  await f.mounted();
  const nativeState = () => f.page.$eval('.ytp-subtitles-button', button =>
    button.getAttribute('aria-pressed'));
  assert.equal(await nativeState(), 'true', 'Initial native-on is preserved');
  for (const expected of ['false', 'true']) {
    await f.page.click('.ytp-subtitles-button');
    assert.equal(await nativeState(), expected);
    const visible = await f.page.$eval('.ytp-caption-window-container', node =>
      !node.hidden && getComputedStyle(node).display !== 'none' &&
      getComputedStyle(node).visibility === 'visible');
    assert.equal(visible, expected === 'true');
    await healthy(f);
  }
  assert.equal(await f.page.evaluate(() => window.trustedClicks.length), 2);
});

test('English captions appear below the source-language captions',
  {timeout: 15000}, async t => {
    const f = await fixture(productionBrowser, t, {translatable: true});
    await f.open();
    await f.mounted();
    await f.page.waitForFunction(() =>
      document.querySelector('.translated-subtitle')?.textContent ===
        'Hello world');
    const lines = await f.page.evaluate(() => {
      const original = document.querySelector('.original-subtitle');
      const translated = document.querySelector('.translated-subtitle');
      return {original: original.textContent,
        sourceBottom: original.getBoundingClientRect().bottom,
        englishTop: translated.getBoundingClientRect().top};
    });
    assert.match(lines.original, /^Hallo Welt/);
    assert(lines.englishTop >= lines.sourceBottom);
    assert.equal(
      f.requests.filter(request => request.tlang === 'en').length, 1,
    );
    await healthy(f);
  });

for (const englishStatus of [200, 429]) {
  test(`existing English track is fetched directly (${englishStatus})`,
    {timeout: 15000}, async t => {
      const f = await fixture(productionBrowser, t,
        {existingEnglish: true, translatable: true, englishStatus});
      await f.open();
      await f.mounted();
      if (englishStatus === 200) {
        await f.page.waitForFunction(() =>
          document.querySelector('.translated-subtitle')?.textContent ===
            'Hello world');
      } else await f.translationFailed;
      assert.equal(f.requests.filter(r => r.lang === 'en-GB').length, 1);
      assert(f.requests.every(r => !r.tlang));
      await healthy(f);
    });
}

test('ads defer acquisition and replaced media drives captions',
  {timeout: 15000}, async t => {
    const f = await fixture(productionBrowser, t, {adStartup: 3500});
    await f.open();
    await f.page.evaluate(() =>
      new Promise(resolve => setTimeout(resolve, 2000)));
    assert.equal(await f.page.evaluate(() => window.captionClicks), 0);
    assert(f.requests.every(r => r.v === 'advertisement'));
    await f.mounted();
    assert.equal(await f.page.$eval('.original-subtitle', node =>
      node.textContent), 'Zweite Zeile', 'Use the new video clock');
    assert(await f.page.evaluate(() => !window.adVideo.isConnected));
    const nativeHidden = await f.page.$eval('.ytp-caption-window-container',
      node => node.hidden);
    await f.page.evaluate(() => {
      document.querySelector('#movie_player').classList.add('ad-showing');
    });
    await f.page.waitForFunction(() =>
      document.querySelector('.subtitle-container')?.hidden);
    assert.equal(await f.page.$eval('.subtitle-container', node =>
      getComputedStyle(node).display), 'none');
    assert.equal(await f.page.$eval('.ytp-caption-window-container', node =>
      node.hidden), nativeHidden, 'Native captions must remain untouched');
    await f.page.evaluate(() => {
      const video = document.createElement('video');
      document.querySelector('#movie_player video').replaceWith(video);
      document.querySelector('#movie_player').classList.remove('ad-showing');
    });
    await f.page.waitForFunction(() =>
      !document.querySelector('.subtitle-container')?.hidden &&
      document.querySelector('.original-subtitle')?.textContent
        .startsWith('Hallo Welt'));
    await healthy(f);
  });

test('an English-caption 429 leaves original captions usable without retries',
  {timeout: 15000}, async t => {
    const f = await fixture(productionBrowser, t,
      {translatable: true, englishStatus: 429});
    await f.open();
    await f.mounted();
    await f.translationFailed;
    assert.equal(await f.page.$eval('.translated-subtitle', node =>
      node.textContent), '');
    assert.equal(
      f.requests.filter(request => request.tlang === 'en').length, 1,
    );
    await healthy(f);
  });

for (const initialOn of [false, true]) {
  test(`trusted CC choice survives acquisition cleanup (initial ${initialOn})`,
    async t => {
      const f = await fixture(productionBrowser, t, {initialOn, delayed: true});
      await f.open();
      await f.page.waitForFunction(() => window.starts > 0);
      // Startup has turned CC on. Choose the opposite of its original setting
      // to check that cleanup keeps the user's choice instead of resetting it.
      if (initialOn) {
        await f.page.focus('.ytp-subtitles-button');
        await f.page.keyboard.press('c');
      } else {
        await f.page.click('.ytp-subtitles-button');
        await f.page.click('.ytp-subtitles-button');
      }
      const chosen = String(!initialOn);
      assert.equal(await f.page.$eval('.ytp-subtitles-button', button =>
        button.getAttribute('aria-pressed')), chosen);
      f.release();
      await f.mounted();
      assert.equal(await f.page.$eval('.ytp-subtitles-button', button =>
        button.getAttribute('aria-pressed')), chosen);
      assert(await f.page.evaluate(() =>
        window.trustedClicks.length + window.trustedKeys.length > 0));
      await healthy(f);
    });
}

for (const pageBeforeInstall of [false, true]) {
  test(`development messaging and reload (page first: ${pageBeforeInstall})`,
    {timeout: 30000}, async t => {
      const browser = await launch(artifacts.directory);
      t.after(() => browser.close());
      let extension;
      if (!pageBeforeInstall) {
        extension = await install(browser, artifacts.development);
        await translations(extension.worker);
      }
      const f = await fixture(browser, t);
      const {page} = f;
      if (pageBeforeInstall) {
        await f.open();
        assert.equal(await page.$('.subtitle-container'), null);
        const navigated = page.waitForNavigation({waitUntil: 'load'});
        [extension] = await Promise.all([
          install(browser, artifacts.development), navigated,
        ]);
      } else {
        await f.open();
      }
      async function translate(worker, expected) {
        await translations(worker, expected);
        await f.mounted();
        await page.$eval('.subtitle-word', button => button.click());
        await page.waitForFunction(text =>
          document.querySelector('.translation-bubble')?.textContent === text,
        {}, expected);
        const calls = await worker.evaluate(() =>
          globalThis.translationRequests.map(request => request.url));
        assert.equal(calls.length, 2);
        assert(calls.some(url => url.includes('translate.googleapis.com')));
        assert(calls.includes('https://oneshot-free.www.deepl.com/v1/translate'));
        await healthy(f);
      }
      await translate(extension.worker, 'before-reload');
      const startupDocuments = pageBeforeInstall ? 2 : 1;
      assert.equal(f.documents(), startupDocuments);
      const cdp = await page.createCDPSession();
      const contexts = new Map();
      cdp.on('Runtime.executionContextCreated', ({context}) =>
        contexts.set(context.id, context));
      await cdp.send('Runtime.enable');
      let oldContext;
      for (const context of contexts.values()) {
        const result = await cdp.send('Runtime.evaluate', {
          contextId: context.id,
          expression: 'typeof chrome !== "undefined" && chrome.runtime?.id',
          returnByValue: true});
        if (result.result.value === extension.id) oldContext = context.id;
      }
      assert(oldContext, 'Found actual isolated content context');
      await page.$eval('.subtitle-container', node => node.dataset.oldUi = '1');
      const navigation = page.waitForNavigation({waitUntil: 'load'});
      const nextTarget = browser.waitForTarget(target =>
        target !== extension.target && target.type() === 'service_worker' &&
        target.url().startsWith(`chrome-extension://${extension.id}/`));
      await extension.worker.evaluate(() => chrome.runtime.reload());
      const [, target] = await Promise.all([navigation, nextTarget]);
      assert.equal(await page.$('[data-old-ui]'), null);
      await assert.rejects(cdp.send('Runtime.evaluate', {
        contextId: oldContext, expression: '1',
      }), /Cannot find context|Execution context was destroyed/);
      await translate(await target.worker(), 'after-reload');
      assert.equal(f.documents(), startupDocuments + 1,
        'Exactly one automatic refresh; no driver reload or refresh loop');
    });
}
