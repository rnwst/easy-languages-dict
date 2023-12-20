'use strict';

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import webExt from 'web-ext';


const dist = 'dist/';
const browsers = ['chromium', 'firefox-desktop'];


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
  if (args.length === 0) return;
  if (args.length === 2 && args[0] === 'watch' && browsers.includes(args[1])) {
    return;
  }
  console.log('Incorrect arguments supplied. Exiting.');
  process.exit();
}


/**
 * Delete contents of 'dist/{browser}' folder.
 * @param {string} browser - Browser
 */
function clean(browser) {
  const distDir = path.join(dist, browser);
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
  if (browser === 'firefox-desktop') {
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
  }
  return newManifest;
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
    files.push(...webAccessibleResource.resources);
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
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);
    if (!fs.existsSync(targetFile) || hashFile(targetFile) !== hashFile(file)) {
      console.log(`Copying file ${file}`);
      fs.copyFileSync(file, targetFile);
    }
  }
}


/**
 * @param {string} entryPoint - Entry point for esbuild
 * @param {string} distDir - Directory of output file
 * @param {object} plugin - Esbuild plugin
 * @return {object} - Esbuld options
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
  writeManifest(browserSpecificManifest, path.join(dist, browser));

  const filesToBeSynced = getFilesToBeSynced(manifest);
  filesToBeSynced.forEach((file) => sync(file, path.join(dist, browser)));

  // Build content scripts.
  const contentScripts = manifest.content_scripts;
  for (const contentScript of contentScripts) {
    for (const script of contentScript.js) {
      console.log(`Building content script ${script} using esbuild`);
      await esbuild.build(esbuildOptions(script, path.join(dist, browser)));
    }
  }

  // Build background script.
  const serviceWorker = manifest.background?.service_worker;
  if (serviceWorker) {
    console.log(`Building background script ${serviceWorker} using esbuild`);
    await esbuild.build(
        esbuildOptions(serviceWorker, path.join(dist, browser)),
    );
  }
}


/**
 * `fs.watch()` does not work correctly, and often
 * - reports changes as a 'rename', and
 * - reports the same event more than once.
 * To fix this, a custom function is provided, which checks if the underlying
 * file has actually changed.
 * @param {string} file - File to be watched
 * @param {function} callback - Function to call if file changes
 * @return {object} - File watcher which may be terminated later
 */
function watchFile(file, callback) {
  let fileHash = hashFile(file);
  return fs.watch(file, () => {
    if (fs.existsSync(file)) {
      if (hashFile(file) !== fileHash) {
        console.log(`\nDetected change in file ${file}`);
        fileHash = hashFile(file);
        callback();
      }
    }
  });
}


/**
 * Launch browser with extension, watch for changes, rebuild and reload. Assumes
 * that the extension has already been built.
 * @param {string} browser - Browser to launch with extension
 */
async function watch(browser) {
  const extensionRunner = await webExt.cmd.run({
    // Options correspond to CLI options.
    sourceDir: path.join(dist, browser),
    noReload: true,
    target: browser,
    chromiumProfile: 'browser-profiles/chromium',
    firefoxProfile: 'browser-profiles/firefox-desktop',
    keepProfileChanges: true,
    profileCreateIfMissing: true,
    startUrl: 'https://www.youtube.com/watch?v=9G9liRZvi5E',
  });

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

  const createContexts = async () => {
    const contexts = [];

    const manifest = readManifest();

    // Watch non-JS files.
    getFilesToBeSynced(manifest).forEach((file) => {
      const watcher = watchFile(file, () => {
        sync(file, path.join(dist, browser));
        extensionRunner.reloadAllExtensions();
      });
      // The contexts created by esbuild have a `dispose` method. To allow for
      // termination of all contexts using this method, we add one here as well.
      contexts.push({dispose: () => watcher.close()});
    });

    // Watch content scripts.
    const contentScripts = manifest.content_scripts;
    for (const contentScript of contentScripts) {
      for (const script of contentScript.js) {
        const context = await esbuild.context(
            esbuildOptions(script, path.join(dist, browser), reloadPlugin),
        );
        await context.watch();
        contexts.push(context);
      }
    }

    // Watch background script.
    const serviceWorker = manifest.background?.service_worker;
    if (serviceWorker) {
      const context = await esbuild.context(
          esbuildOptions(serviceWorker, path.join(dist, browser), reloadPlugin),
      );
      await context.watch();
      contexts.push(context);
    }

    return contexts;
  };

  let contexts = await createContexts();

  // Listen for changes in the manifest file.
  watchFile('manifest.json', async () => {
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
    for (const browser of browsers) {
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
