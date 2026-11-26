import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {build} from '../../scripts/build.js';

const browsers = new WeakMap();

export function browserName(browser) {
  return browsers.get(browser);
}

export async function buildFixtures(browser = 'chromium',
  label = 'translation') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eld-browser-'));
  try {
    const production = path.join(directory, 'production');
    const development = path.join(directory, 'development');
    await build(browser, false, production);
    if (browser === 'chromium') {
      await build(browser, false, development, true);
    } else {
      // BiDi does not expose Firefox's MV2 background page as a target.
      // Stub only fetch, before the real background listeners start. Installing
      // it at startup also preserves the stub after an event-page restart.
      const background = path.join(production, 'background/main.js');
      await fs.writeFile(background,
        `(${stubTranslations.toString()})(${JSON.stringify(label)});\n` +
        await fs.readFile(background, 'utf8'));
    }
    return {directory, production, development};
  } catch (error) {
    await fs.rm(directory, {recursive: true, force: true});
    throw error;
  }
}

async function debuggingPort() {
  for (const port of [3000, 3001, 3002, 5173]) {
    const server = net.createServer();
    const available = await new Promise((resolve, reject) => {
      server.once('error', error => {
        if (error.code === 'EADDRINUSE') resolve(false);
        else reject(error);
      });
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('No free Firefox debug port (3000, 3001, 3002, or 5173)');
}

export async function launch(directory, name = 'chromium') {
  const profile = await fs.mkdtemp(path.join(directory, 'profile-'));
  const firefox = name === 'firefox';
  const executablePath = firefox ? process.env.FIREFOX_EXECUTABLE_PATH :
    process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!firefox) {
    await fs.mkdir(path.join(profile, 'Default'));
    // Chromium 156 ignores runtime.reload() for unpacked extensions when this
    // preference is disabled. Never read or modify a user's browser profile.
    await fs.writeFile(path.join(profile, 'Default', 'Preferences'),
      JSON.stringify({extensions: {ui: {developer_mode: true}}}));
  }
  try {
    const browser = await puppeteer.launch({
      browser: firefox ? 'firefox' : 'chrome', userDataDir: profile,
      ...(firefox ? {debuggingPort: await debuggingPort()} :
        {pipe: true, enableExtensions: true}),
      headless: process.env.BROWSER_HEADFUL !== '1',
      ...(executablePath ? {executablePath} : {}),
      args: !firefox && process.env.CI ? ['--no-sandbox'] : [],
    });
    browsers.set(browser, name);
    return browser;
  } catch (cause) {
    await fs.rm(profile, {recursive: true, force: true});
    const browser = firefox ? 'firefox' : 'chrome';
    const variable = firefox ? 'FIREFOX_EXECUTABLE_PATH' :
      'PUPPETEER_EXECUTABLE_PATH';
    throw new Error(`Cannot launch ${name}. Run ` +
      `npx puppeteer browsers install ${browser}, or set ${variable} ` +
      'to a compatible executable.', {cause});
  }
}

export async function install(browser, directory) {
  const id = await browser.installExtension(directory);
  if (browserName(browser) === 'firefox') return {id};
  const target = await browser.waitForTarget(target =>
    target.type() === 'service_worker' &&
    target.url().startsWith(`chrome-extension://${id}/`));
  return {id, target, worker: await target.worker()};
}

/** Supply fake translation-server responses. The extension still sends real
 * messages to its background script and runs its normal translator functions.
 */
export async function translations(worker, label = 'translation') {
  await worker.evaluate(stubTranslations, label);
}

function stubTranslations(label) {
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
}
