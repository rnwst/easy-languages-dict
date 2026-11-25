import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {build} from '../../scripts/build.js';

export async function buildFixtures() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eld-browser-'));
  try {
    const production = path.join(directory, 'production');
    const development = path.join(directory, 'development');
    await build('chromium', false, production);
    await build('chromium', false, development, true);
    return {directory, production, development};
  } catch (error) {
    await fs.rm(directory, {recursive: true, force: true});
    throw error;
  }
}

export async function launch(directory) {
  const profile = await fs.mkdtemp(path.join(directory, 'profile-'));
  await fs.mkdir(path.join(profile, 'Default'));
  // Chromium 156 ignores runtime.reload() for unpacked extensions when this
  // preference is disabled. Never read or modify a user's browser profile.
  await fs.writeFile(path.join(profile, 'Default', 'Preferences'),
    JSON.stringify({extensions: {ui: {developer_mode: true}}}));
  return puppeteer.launch({
    userDataDir: profile, pipe: true, enableExtensions: true,
    headless: process.env.BROWSER_HEADFUL !== '1',
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    } : {}),
    args: process.env.CI ? ['--no-sandbox'] : [],
  });
}

export async function install(browser, directory) {
  const id = await browser.installExtension(directory);
  const target = await browser.waitForTarget(target =>
    target.type() === 'service_worker' &&
    target.url().startsWith(`chrome-extension://${id}/`));
  return {id, target, worker: await target.worker()};
}

/** Supply fake translation-server responses. The extension still sends real
 * messages to its background script and runs its normal translator functions.
 */
export async function translations(worker, label = 'translation') {
  await worker.evaluate(label => {
    globalThis.translationRequests = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      globalThis.translationRequests.push({url, body: init?.body});
      let response;
      if (url.startsWith('https://translate.googleapis.com/')) {
        response = [[[label]]];
      } else if (url === 'https://oneshot-free.www.deepl.com/v1/translate') {
        response = {translations: [{text: `<b>${label}</b> world`}]};
      } else {
        throw new Error(`Unexpected background request: ${url}`);
      }
      return new Response(JSON.stringify(response), {
        status: 200, headers: {'Content-Type': 'application/json'},
      });
    };
  }, label);
}
