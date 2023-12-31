'use strict';

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import webExt from 'web-ext';
// See https://github.com/import-js/eslint-plugin-import/issues/1810.
// eslint-disable-next-line import/no-unresolved
import * as adbUtils from 'web-ext/util/adb';
import {optimize as optimizeSVG} from 'svgo';
import svg2png from 'convert-svg-to-png';


const dist = 'dist/';


/**
 * @return {array} - Arguments passed to this script.
 */
function getArgs() {
  return process.argv.slice(2);
}


/**
 * Exit the script if invalid arguments were passed.
 */
function exitIfIncorrectArgs() {
  const args = getArgs();
  const browsers = ['chromium', 'firefox-desktop', 'firefox-android'];
  if (args.length === 0) return;
  if (args.length === 2 && args[0] === 'watch' && browsers.includes(args[1])) {
    return;
  }
  console.log('Incorrect arguments supplied. Exiting.');
  process.exit();
}


/**
 * 'firefox-desktop' and 'firefox-android' share the same distributable.
 * @param {string} browser - Browser
 * @return {string} - Browser-specific distributable directory
 */
function browserDist(browser) {
  return path.join(dist, browser === 'chromium' ? 'chromium' : 'firefox');
}


/**
 * Delete contents of 'dist/{browser}' folder.
 * @param {string} browser - Browser
 */
function clean(browser) {
  const distDir = browserDist(browser);
  if (fs.existsSync(distDir)) {
    console.log(`Cleaning out contents of ${distDir}`);
    fs.rmSync(distDir, {recursive: true});
  }
  fs.mkdirSync(distDir, {recursive: true});
}


/**
 * @return {object} - Contents of `manifest.json`
 */
function readManifest() {
  const data = fs.readFileSync('manifest.json');
  return JSON.parse(data);
}


/**
 * @param {object} manifest - Manifest to be written
 * @param {object} distDir - Manifest.json output directory
 */
function writeManifest(manifest, distDir) {
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
  fs.writeFileSync(
      path.join(distDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
  );
}


/**
 * @param {object} manifest - MV3 manifest
 */
function convertMV3ToMV2(manifest) {
  manifest.manifest_version = 2;
  // Background scripts in MV3 are always non-persistent, but can be persistent
  // in MV2 (non-persistent background scripts are sometimes referred to as
  // 'event pages'). They should not be persistent on Firefox on Android:
  // https://blog.mozilla.org/addons/2023/08/10/prepare-your-firefox-desktop-extension-for-the-upcoming-android-release/
  manifest.background.persistent = false;
  // `web_accessible_resources` are defined differently in MV3 vs MV2. See
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources.
  manifest.web_accessible_resources = manifest.web_accessible_resources
      .map((resource) => resource.resources).flat();
  // `host_permissions` don't exist in MV2.
  manifest.permissions.push(...manifest.host_permissions);
  delete manifest.host_permissions;
}


/**
 * @param {object} manifest - Original manifest
 * @param {string} browser - Browser for which to adapt manifest
 * @return {object} - Manifest adapted to browser
 */
function adaptManifestToBrowser(manifest, browser) {
  const newManifest = structuredClone(manifest);
  if (browser === 'chromium') {
    // Chromium doesn't recognize `browser_specific_settings`.
    delete newManifest.browser_specific_settings;
    // Chromium doesn't support SVGs for icons. See
    // https://bugs.chromium.org/p/chromium/issues/detail?id=29683.
    for (const size in newManifest?.icons) {
      if (size) {
        newManifest.icons[size] =
            newManifest.icons[size].replace(/\.svg$/, '.png');
      }
    }
  }
  if (browser.match('firefox')) {
    // The background service worker is not yet supported on Firefox:
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1573659.
    newManifest.background.scripts = [manifest.background.service_worker];
    // From FF 121 onwards, the presence of the `service_worker` key doesn't
    // cause any issues, but for earlier versions, the background script does
    // not start.
    delete newManifest.background.service_worker;
    // I don't consider Firefox's version of MV3 useable yet. All permissions
    // are optional, and the user is not automatically prompted for those
    // permissions. The extension therefore doesn't work due to a lack of
    // required permissions, and the user is left wondering why. In addition,
    // MV3 is not (yet) supported on Firefox for Android.
    convertMV3ToMV2(newManifest);
    // Firefox only wants a 48x48px icon, and luckily accepts SVGs.
    delete newManifest.icons['128'];
  }
  return newManifest;
}


/**
 * @param {string} distDir - Output directory
 */
function copyTesseractFiles(distDir) {
  console.log('Copying Tesseract.js files');
  const tesseractFiles = [
    'node_modules/tesseract.js/dist/worker.min.js',
    'node_modules/tesseract.js/dist/worker.min.js.map',
  ];
  const tesseractCoreFiles = [
    'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
    'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  ];
  for (const [dir, files] of [
    ['tesseract', tesseractFiles],
    ['tesseract-core', tesseractCoreFiles],
  ]) {
    const targetDir = path.join(distDir, 'content', dir);
    fs.mkdirSync(targetDir, {recursive: true});
    files.forEach((file) => {
      fs.copyFileSync(file, path.join(targetDir, path.basename(file)));
    });
  }
}


/**
 * Get list of non-JS files to be copied to `dist/`.
 * @param {object} manifest - Manifest
 * @return {array} - Array of files to be copied to `dist/`
 */
function getFilesToBeSynced(manifest) {
  const files = [];
  // Content script CSS (the JS will be taken care of by the bundler).
  const contentScripts = manifest.content_scripts;
  for (const contentScript of contentScripts) {
    if (contentScript.css.length) {
      files.push(...contentScript.css);
    }
  }
  // Web accessible resources.
  const webAccessibleResources = manifest.web_accessible_resources;
  for (const webAccessibleResource of webAccessibleResources) {
    for (const resource of webAccessibleResource.resources) {
      // Don't attempt to sync the tesseract files, as they are copied
      // separately.
      if (!resource.match('tesseract')) files.push(resource);
    }
  }
  return files;
}


/**
 * @param {string} file - File whose contents are to be hashed
 * @return {string} - MD5 hash of file's contents
 */
function hashFile(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}


/**
 * Sync a file in the `dist/` directory with its equivalent in the root
 * directory. Create it if it doesn't exist (along with its parent directories,
 * if they also don't exist). Overwrite the file if it does exist and its
 * contents have changed. Delete the file if its equivalent in the root
 * directory is no longer present.
 * @param {string} file - File to be synced
 * @param {string} distDir - Directory of output file
 */
function sync(file, distDir) {
  const targetDir = path.join(distDir, path.dirname(file));
  const targetFile = path.join(distDir, file);
  if (fs.existsSync(file)) {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, {recursive: true});
    if (!fs.existsSync(targetFile) || hashFile(targetFile) !== hashFile(file)) {
      console.log(`Copying file ${file}`);
      fs.copyFileSync(file, targetFile);
    }
  } else {
    console.warn(`Attempting to copy ${file}, but it doesn't exist!`);
  }
}


/**
 * For Firefox, which accepts SVG icons, optimize SVGs before copying, and for
 * Chromium, which doesn't accept SVGs, convert SVGs to PNGs.
 * @param {object} icon - Icon file
 * @param {string} size - Icon size in pixels
 * @param {string} distDir - Directory of output file
 */
async function buildIcon(icon, size, distDir) {
  const regex = /\.(?<ext>(svg|png))$/;
  const fileEnding = icon.match(regex).groups['ext'];
  const svgIcon = icon.replace(regex, '.svg');

  const svgStr = fs.readFileSync(svgIcon);
  const optimizedSVGStr = optimizeSVG(svgStr, {
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // Firefox requires the viewBox attribute:
            // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/icons#svg
            removeViewBox: false,
          },
        },
      },
    ],
  }).data;

  const targetDir = path.join(distDir, path.dirname(icon));
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, {recursive: true});

  if (fileEnding === 'svg') {
    console.log(`Optimizng ${icon} and writing to dist`);
    fs.writeFileSync(path.join(distDir, icon), optimizedSVGStr);
  } else {
    // Chromium doesn't support SVGs unfortunately. See
    // https://bugs.chromium.org/p/chromium/issues/detail?id=29683.
    console.log(
        `Converting ${svgIcon} to PNG and writing to dist`);
    const png48 =
        await svg2png.convert(optimizedSVGStr, {width: size, height: size});
    fs.writeFileSync(path.join(distDir, icon), png48);
  }
}


/**
 * @param {string} entryPoint - Entry point for esbuild
 * @param {string} distDir - Output directory
 * @param {object} plugin - Esbuild plugin
 * @return {object} - Esbuild options
 */
function esbuildOptions(entryPoint, distDir, plugin) {
  return {
    entryPoints: [entryPoint],
    // Since the background script is an ES6 module, it doesn't have to be
    // bundled. Unfortunately, esbuild doesn't behave as one might expect when
    // `bundle` is set to `false`:
    // https://github.com/evanw/esbuild/issues/708. Once this issue has been
    // resolved, `bundle` can be set to `(background.type === 'module')`.
    bundle: true,
    outfile: path.join(distDir, entryPoint),
    minify: true,
    sourcemap: 'inline',
    ...(plugin && {plugins: [plugin]}),
    logLevel: 'warning',
  };
}


/**
 * Build function.
 * @param {string} browser - Browser to build for
 */
async function build(browser) {
  const manifest = readManifest();
  const browserSpecificManifest = adaptManifestToBrowser(manifest, browser);
  writeManifest(browserSpecificManifest, browserDist(browser));

  copyTesseractFiles(browserDist(browser));

  const filesToBeSynced = getFilesToBeSynced(manifest);
  filesToBeSynced.forEach((file) => sync(file, browserDist(browser)));

  // Build icons.
  const icons = browserSpecificManifest?.icons;
  if (icons) {
    for (const [size, icon] of Object.entries(icons)) {
      buildIcon(icon, size, browserDist(browser));
    }
  }

  // Build content scripts.
  const contentScripts = manifest.content_scripts;
  for (const contentScript of contentScripts) {
    for (const script of contentScript.js) {
      console.log(`Building content script ${script} using esbuild`);
      await esbuild.build(esbuildOptions(script, browserDist(browser)));
    }
  }

  // Build background script.
  const serviceWorker = manifest.background?.service_worker;
  if (serviceWorker) {
    console.log(`Building background script ${serviceWorker} using esbuild`);
    await esbuild.build(
        esbuildOptions(serviceWorker, browserDist(browser)),
    );
  }
}


/**
 * `fs.watch()` does not work correctly, and often
 * - reports the same event more than once,
 * - incorrectly reports changes as a 'rename', and
 * - as a result doesn't report any future file changes.
 * To fix this, a custom function is provided, which checks if the underlying
 * file has actually changed, and then instantiates a new file watcher to
 * continue keeping track of any changes.
 * @param {string} file - File to be watched
 * @param {function} callback - Function to call if file changes
 * @return {object} - File watcher context which can be terminated later
 */
class FileWatcherContext {
  /* eslint-disable require-jsdoc */
  #file;
  #callback;
  #abortController;
  #fileHash;
  #fileWatcher;

  constructor(file, callback) {
    this.#file = file;
    this.#callback = callback;
    this.#updateFileWatcher();
  }

  dispose() {
    this.#abortController?.abort();
  }

  #updateFileWatcher() {
    this.#fileHash = hashFile(this.#file);
    this.dispose();
    this.#abortController = new AbortController();
    this.#fileWatcher = fs.watch(
        this.#file,
        {signal: this.#abortController.signal},
        this.#fileWatcherCallback.bind(this),
    );
  }

  #fileWatcherCallback() {
    if (fs.existsSync(this.#file)) {
      if (hashFile(this.#file) !== this.#fileHash) {
        console.log(`\nDetected change in file ${this.#file}`);
        this.#updateFileWatcher();
        this.#callback();
      }
    } else {
      this.#abortController.abort();
    }
  }
  /* eslint-enable require-jsdoc */
}


/**
 * Launch browser with extension, watch for changes, rebuild and reload. Assumes
 * that the extension has already been built.
 * @param {string} browser - Browser to launch with extension
 */
async function watch(browser) {
  const extensionRunner = await webExt.cmd.run({
    // Options correspond to CLI options.
    sourceDir: browserDist(browser),
    noReload: true,
    target: browser,

    ...(browser === 'chromium' &&
      {chromiumProfile: 'browser-profiles/chromium'}),

    ...(browser === 'firefox-desktop' &&
      {firefoxProfile: 'browser-profiles/firefox'}),

    ...(['chromium', 'firefox-desktop'].includes(browser) && {
      keepProfileChanges: true,
      profileCreateIfMissing: true,
      startUrl: 'https://www.youtube.com/watch?v=9G9liRZvi5E',
    }),

    ...(browser === 'firefox-android' && {
      adbDevice: (await adbUtils.listADBDevices())[0],
      firefoxApk: 'org.mozilla.fenix',
      adbRemoveOldArtifacts: true,
    }),
  });

  const createContexts = async () => {
    const contexts = [];

    const manifest = readManifest();

    // Watch non-JS files.
    getFilesToBeSynced(manifest).forEach((file) => {
      const context = new FileWatcherContext(file, () => {
        sync(file, browserDist(browser));
        extensionRunner.reloadAllExtensions();
      });
      // The contexts created by esbuild have a `dispose` method. To allow for
      // termination of all contexts using this method, we add one here as well.
      contexts.push(context);
    });

    // Watch icons.
    const icons = adaptManifestToBrowser(manifest, browser)?.icons;
    if (icons) {
      for (const [size, icon] of Object.entries(icons)) {
        const context =
            new FileWatcherContext(icon.replace(/\.png$/, '.svg'), () => {
              buildIcon(icon, size, browserDist(browser));
              extensionRunner.reloadAllExtensions();
            });
        contexts.push(context);
      }
    }

    // This esbuild plugin is needed to reload the extension if the source files
    // change.
    const reloadPlugin = {
      name: 'reload extension',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            extensionRunner.reloadAllExtensions();
          }
        });
      },
    };

    // Watch content scripts.
    const contentScripts = manifest.content_scripts;
    for (const contentScript of contentScripts) {
      for (const script of contentScript.js) {
        const context = await esbuild.context(
            esbuildOptions(script, browserDist(browser), reloadPlugin),
        );
        await context.watch();
        contexts.push(context);
      }
    }

    // Watch background script.
    const serviceWorker = manifest.background?.service_worker;
    if (serviceWorker) {
      const context = await esbuild.context(
          esbuildOptions(serviceWorker, browserDist(browser), reloadPlugin),
      );
      await context.watch();
      contexts.push(context);
    }

    return contexts;
  };

  let contexts = await createContexts();

  // Listen for changes in the manifest file.
  new FileWatcherContext('manifest.json', async () => {
    console.log(`Changes detected in 'manifest.json'. Rebuilding.`);
    contexts.forEach((context) => context.dispose());
    clean(browser);
    await build(browser);
    extensionRunner.reloadAllExtensions();
    contexts = await createContexts();
  });
}


/**
 * Main function.
 */
async function main() {
  exitIfIncorrectArgs();
  const args = getArgs();

  if (args.length === 0) {
    // 'firefox-desktop' and 'firefox-android' share the same distributable.
    for (const browser of ['chromium', 'firefox']) {
      const buildMsg = `Building extension for target ${browser}:`;
      console.log(`\n${buildMsg}\n${'='.repeat(buildMsg.length)}`);
      clean(browser);
      await build(browser);
    }
    console.log('\n');
  } else {
    const browser = args[1];
    await build(browser);
    await watch(browser);
  }
}


main();
