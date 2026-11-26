import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {artifacts, fixtureTranslation, healthy, setup} from './production.js';
import {launch, install} from './harness.js';
import {fixture, watchURL} from './fixture.js';

setup('firefox');

test('Firefox MV2 installation and reinstall restore translation messaging',
  {timeout: 30000}, async t => {
    const manifest = JSON.parse(await fs.readFile(
      path.join(artifacts.production, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 2);
    assert.deepEqual(manifest.background, {
      scripts: ['background/main.js'], persistent: false,
    });
    assert(manifest.permissions.includes('webNavigation'));
    assert(manifest.permissions.includes('https://translate.googleapis.com/*'));
    assert.deepEqual(manifest.content_scripts.map(script => script.world),
      ['ISOLATED', 'MAIN']);

    const browser = await launch(artifacts.directory, 'firefox');
    t.after(() => browser.close());
    const f = await fixture(browser, t);
    await f.open();
    assert.equal(await f.page.$('.subtitle-container'), null);
    let extension = await install(browser, artifacts.production);
    for (const iteration of [0, 1]) {
      if (iteration) {
        await browser.uninstallExtension(extension.id);
        extension = await install(browser, artifacts.production);
      }
      // Firefox has no development auto-refresh. A real document navigation
      // loads the newly installed content scripts and their message listeners.
      await f.open();
      assert.equal(await f.page.$('[data-old-ui]'), null);
      await f.mounted();
      await f.page.click('.subtitle-word');
      await f.page.waitForFunction(expected =>
        document.querySelector('.translation-bubble')?.textContent === expected,
      {}, fixtureTranslation);
      await healthy(f);
      // No synthetic YouTube navigation events: exercise webNavigation in the
      // actual MV2 background script and its runtime message to the tab.
      await f.page.evaluate(() => history.pushState({}, '', '/'));
      await f.page.waitForFunction(() =>
        !document.querySelector('.subtitle-container'));
      await f.page.evaluate(url => history.pushState({}, '', url), watchURL);
      await f.mounted();
      await healthy(f);
      await f.page.$eval('.subtitle-container', node => {
        node.dataset.oldUi = '1';
      });
      assert.equal(f.documents(), iteration + 2);
    }
  });
