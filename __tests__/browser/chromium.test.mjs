import {test} from 'node:test';
import assert from 'node:assert/strict';
import {artifacts, healthy, setup} from './production.js';
import {launch, install, translations} from './harness.js';
import {fixture} from './fixture.js';

setup('chromium');

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
