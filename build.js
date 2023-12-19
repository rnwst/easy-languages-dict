'use strict';

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import webExt from 'web-ext';


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
  const operations = ['build', 'watch'];
  if (operations.filter((op) => getArgs().includes(op)).length !== 1) {
    console.error(
        `Please provide one of '${operations.join('\', \'')}'. Exiting.`,
    );
    process.exit();
  }
}


/**
 * @return {object} - Contents of `manifest.json`
 */
function readManifest() {
  const data = fs.readFileSync('manifest.json');
  return JSON.parse(data);
}


/**
 * Delete contents of 'dist/' folder.
 */
function clean() {
  if (fs.existsSync(dist)) {
    console.log(`Cleaning out contents of ${dist}`);
    fs.rmSync(dist, {recursive: true});
  }
  fs.mkdirSync(dist);
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
 */
function sync(file) {
  const distDir = path.join(dist, path.dirname(file));
  const distFile = path.join(dist, file);
  if (fs.existsSync(file)) {
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
    if (!fs.existsSync(distFile) || hashFile(distFile) !== hashFile(file)) {
      console.log(`Copying file ${file}`);
      fs.copyFileSync(file, distFile);
    }
  } else {
    if (fs.existsSync(distFile)) {
      console.log(`Removing file ${file}`);
      fs.rmSync(distFile);
    }
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
 * Build function.
 * @param {object} manifest - Object corresponding to `manifest.json`
 * @param {boolean} watch - Whether to watch for file changes and rebuild
 * @param {object} reloadExtensionPlugin - Esbuild plugin to reload extension
 */
async function build(manifest, watch, reloadExtensionPlugin) {
  // Contexts are returned by this function when in 'watch' mode so that they
  // can be terminated later.
  const contexts = [];

  // First, let's get a list of files that are copied to the output directory.
  const filesToBeSynced = ['manifest.json'];
  // Content script CSS. The JS will be taken care of by the bundler.
  const contentScripts = manifest.content_scripts;
  for (const contentScript of contentScripts) {
    if (contentScript.css.length) {
      filesToBeSynced.push(...contentScript.css);
    }
  }
  // Web accessible resources.
  const webAccessibleResources = manifest.web_accessible_resources;
  for (const webAccessibleResource of webAccessibleResources) {
    filesToBeSynced.push(...webAccessibleResource.resources);
  }

  // Now sync files.
  filesToBeSynced.forEach((file) => sync(file));
  if (watch) {
    const ctx = {
      watchers: [],
      dispose() {
        this.watchers.forEach((watcher) => watcher.close());
      },
    };
    filesToBeSynced.forEach((file) => {
      const watcher = watchFile(file, () => {
        sync(file);
        reloadExtensionPlugin.setup({
          onEnd(callback) {
            callback({errors: []});
          },
        });
      });
      ctx.watchers.push(watcher);
    });
    contexts.push(ctx);
  }

  const esbuildPlugins = reloadExtensionPlugin ? [reloadExtensionPlugin] : [];

  // Build content scripts.
  for (const contentScript of contentScripts) {
    for (const script of contentScript.js) {
      const options = {
        entryPoints: [script],
        bundle: true,
        outfile: path.join(dist, script),
        sourcemap: 'inline',
        plugins: esbuildPlugins,
        logLevel: 'info',
      };
      if (watch) {
        const ctx = await esbuild.context(options);
        await ctx.watch();
        contexts.push(ctx);
      } else {
        await esbuild.build(options);
      }
    }
  }

  // Build background script.
  const serviceWorker = manifest.background?.service_worker;
  if (serviceWorker) {
    const options = {
      entryPoints: [serviceWorker],
      // Since the background script is an ES6 module, it doesn't have to be
      // bundled. Unfortunately, esbuild doesn't behave as one might expect when
      // `bundle` is set to `false`:
      // https://github.com/evanw/esbuild/issues/708. Once this issue has been
      // resolved, `bundle` can be set to `(background.type === 'module')`.
      bundle: true,
      outfile: path.join(dist, serviceWorker),
      sourcemap: 'inline',
      plugins: esbuildPlugins,
      logLevel: 'info',
    };
    if (watch) {
      const ctx = await esbuild.context(options);
      await ctx.watch();
      contexts.push(ctx);
    } else {
      await esbuild.build(options);
    }
  }

  return contexts;
}


/**
 * Main function.
 */
async function main() {
  exitIfIncorrectArgs();

  // `manifest.json` tells us which files we need to consider.
  let manifest = await readManifest();

  clean();
  await build(manifest, false, null);

  if (getArgs().includes('watch')) {
    const extensionRunner = await webExt.cmd.run({
      // Options correspond to CLI options.
      sourceDir: dist,
      noReload: true,
      target: 'chromium',
      chromiumProfile: 'browser-profiles/chromium',
      keepProfileChanges: true,
      startUrl: 'https://www.youtube.com/watch?v=9G9liRZvi5E',
    });

    // This esbuild plugin is needed to reload the extension if the source files
    // change.
    const reloadExtensionPlugin = {
      name: 'reload extension',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            extensionRunner.reloadAllExtensions();
          }
        });
      },
    };

    let contexts = await build(manifest, true, reloadExtensionPlugin);

    // Listen for changes in the manifest file.
    watchFile('manifest.json', async () => {
      console.log(`Changes detected in 'manifest.json'. Rebuilding.`);
      contexts.forEach((ctx) => ctx.dispose());
      manifest = readManifest();
      clean();
      contexts = await build(manifest, true, reloadExtensionPlugin);
    });
  }
}


main();
