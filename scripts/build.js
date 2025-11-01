// @ts-check
'use strict';

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import crypto from 'crypto';
import webExt from 'web-ext';
// See https://github.com/import-js/eslint-plugin-import/issues/1810.
import * as adbUtils from 'web-ext/util/adb';
import {optimize as optimizeSVG} from 'svgo';
import {convert as svg2png} from 'convert-svg-to-png';
import {executablePath} from 'puppeteer';
import archiver from 'archiver';


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
  /** @type{Array<Browser>} browsers */
  const browsers = ['chromium', 'edge', 'firefox-desktop', 'firefox-android'];
  if (args.length === 0) return;
  if (args.length === 2 && args[0] === 'watch' && browsers.includes(args[1])) {
    return;
  }
  console.log('Incorrect arguments supplied. Exiting.');
  process.exit();
}


/**
 * 'firefox-desktop' and 'firefox-android' share the same distributable.
 * @param {Browser} browser - Browser
 * @return {string} - Browser-specific distributable directory
 */
function browserDist(browser) {
  if (browser === 'edge') browser = 'chromium';
  if (['firefox-desktop', 'firefox-android'].includes(browser)) {
    browser = 'firefox';
  }
  return path.join(dist, browser);
}


/**
 * Delete contents of directory.
 * @param {string} dir - Directory to clean out
 */
function cleanDirectory(dir = 'dist/') {
  if (fs.existsSync(dir)) {
    console.log(`Cleaning out contents of ${dir}`);
    fs.rmSync(dir, {recursive: true});
  }
  fs.mkdirSync(dir, {recursive: true});
}


/**
 * @return {chrome.runtime.ManifestV3} - Contents of `manifest.json`
 */
function readManifest() {
  const data = fs.readFileSync('manifest.json', 'utf8');
  return JSON.parse(data);
}


/**
 * @param {ManifestV2 | ManifestV3} manifest - Manifest to be written
 * @param {string} distDir - Manifest.json output directory
 */
function writeManifest(manifest, distDir) {
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
  fs.writeFileSync(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}


/**
 * @param {ManifestV3} manifestV3
 * @return {ManifestV2}
 */
function convertMV3ToMV2(manifestV3) {
  /** @type {ManifestV2} manifestV2 */
  const manifestV2 = {};
  manifestV2.manifest_version = 2;
  // `host_permissions` don't exist in MV2.
  for (const key of [
    'name',
    'version',
    'author',
    'homepage_url',
    'description',
    'icons',
    'content_scripts',
    'background',
    'permissions',
    'web_accessible_resources',
    'minimum_chrome_version',
    'browser_specific_settings'
  ]) {
    manifestV2[key] = manifestV3[key];
  }
  manifestV2.background.scripts = [manifestV3.background.service_worker];
  // Background scripts in MV3 are always non-persistent, but can be persistent
  // in MV2 (non-persistent background scripts are sometimes referred to as
  // 'event pages'). They should not be persistent on Firefox on Android:
  // https://blog.mozilla.org/addons/2023/08/10/prepare-your-firefox-desktop-extension-for-the-upcoming-android-release/
  manifestV2.background.persistent = false;
  // `web_accessible_resources` are defined differently in MV3 vs MV2. See
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources.
  manifestV2.web_accessible_resources = manifestV3.web_accessible_resources
    .map(
      /** @param{{ resources: Array<String>,
                     matches: Array<String> }} resource */
      (resource) => resource.resources
    ).flat();
  manifestV2.permissions.push(...manifestV3.host_permissions);
  return manifestV2;
}


/**
 * @param {ManifestV3} manifest
 * @param {Browser} browser - Browser for which to adapt manifest
 * @return {ManifestV2 | ManifestV3}
 */
function adaptManifestToBrowser(manifest, browser) {
  if (browser === 'chromium') {
    const chromiumManifest = structuredClone(manifest);
    // Chromium doesn't recognize `browser_specific_settings`.
    delete chromiumManifest.browser_specific_settings;
    // Chromium doesn't support SVGs for icons. See
    // https://bugs.chromium.org/p/chromium/issues/detail?id=29683.
    for (const size in chromiumManifest?.icons) {
      if (size) {
        chromiumManifest.icons[size] =
            chromiumManifest.icons[size].replace(/\.svg$/, '.png');
      }
    }
    return chromiumManifest;
  }
  if (browser.match('firefox')) {
    // I don't consider Firefox's version of MV3 useable yet. All permissions
    // are optional, and the user is not automatically prompted for those
    // permissions. The extension therefore doesn't work due to a lack of
    // required permissions, and the user is left wondering why. In addition,
    // MV3 is not (yet) supported on Firefox for Android.
    const firefoxManifest = convertMV3ToMV2(manifest);
    // Firefox only wants a 48x48px icon, and luckily accepts SVGs.
    delete firefoxManifest.icons['128'];
    return firefoxManifest;
  }
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
  for (const [dir, files] of /** @type [String, String[]][] */ ([
    ['tesseract', tesseractFiles],
    ['tesseract-core', tesseractCoreFiles],
  ])) {
    const targetDir = path.join(distDir, 'content', dir);
    fs.mkdirSync(targetDir, {recursive: true});
    files.forEach((file) => {
      const targetFile = path.join(targetDir, path.basename(file));
      fs.copyFileSync(file, targetFile);
      // `worker.min.js` includes a reference to remotely hosted code
      // (tesseract.js-core files). Remotely hosted code is disallowed in the
      // Chrome Web Store for MV3 extensions. The code never actually loads the
      // remote resource, as it is included in the bundle, but the Chrome Web
      // Store detects a violation anyway, likely using a simple search for a
      // CDN URL in the source files. The remote URL is partially removed, to
      // avoid rejection by the Chrome Web Store.
      if (path.basename(file) === 'worker.min.js') {
        fs.writeFileSync(targetFile, fs.readFileSync(targetFile).toString()
          .replaceAll('https://cdn.jsdelivr.net', ''),
        );
      }
    });
  }
}


/**
 * Get list of non-JS files to be copied to `dist/`.
 * @param {ManifestV3} manifest - Manifest
 * @return {Array<string>} - Array of files to be copied to `dist/`
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
 * @param {string} icon - Icon file
 * @param {string} size - Icon size in pixels
 * @param {string} distDir - Directory of output file
 */
async function buildIcon(icon, size, distDir) {
  const regex = /\.(?<ext>(svg|png))$/;
  const fileEnding = icon.match(regex).groups['ext'];
  const svgIcon = icon.replace(regex, '.svg');

  const svgStr = fs.readFileSync(svgIcon, 'utf-8');
  const optimizedSVGStr = optimizeSVG(svgStr).data;

  const targetDir = path.join(distDir, path.dirname(icon));
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, {recursive: true});

  if (fileEnding === 'svg') {
    console.log(`Optimizing ${icon} and writing to dist`);
    fs.writeFileSync(path.join(distDir, icon), optimizedSVGStr);
  } else {
    // Chromium doesn't support SVGs unfortunately. See
    // https://bugs.chromium.org/p/chromium/issues/detail?id=29683.
    console.log(
      `Converting ${svgIcon} to PNG and writing to dist`);
    const puppeteerLaunchOptions = {executablePath};
    // Needed for puppeteer to work in GitHub workflows.
    if (process.env.CI) puppeteerLaunchOptions.args = ['--no-sandbox'];
    const png =
        await svg2png(optimizedSVGStr, {
          launch: puppeteerLaunchOptions,
          width: size,
          height: size
        });
    fs.writeFileSync(path.join(distDir, icon), png);
  }
}


/**
 * @param {string} entryPoint - Entry point for esbuild
 * @param {string} distDir - Output directory
 * @param {ESBuildPlugin} [plugin] - Esbuild plugin
 * @return {ESBuildOptions} - Esbuild options
 */
function esbuildOptions(entryPoint, distDir, plugin) {
  const outfile = path.join(distDir, entryPoint);

  /** @type {ESBuildPlugin} */
  const typeScriptPlugin = {
    name: 'typecheck',
    setup(build) {
      build.onStart(() => {
        const parsedConfig = ts.parseJsonConfigFileContent(
          JSON.parse(fs.readFileSync('tsconfig.json').toString()),
          ts.sys,
          '.',
        );

        const program = ts.createProgram({
          rootNames: parsedConfig.fileNames,
          options: parsedConfig.options,
        });

        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .filter((d) => d.category === ts.DiagnosticCategory.Error);

        if (diagnostics.length) {
          const formatted = ts.formatDiagnosticsWithColorAndContext(
            diagnostics,
            {
              getCanonicalFileName: (f) => f,
              getCurrentDirectory: ts.sys.getCurrentDirectory,
              getNewLine: () => ts.sys.newLine,
            }
          );

          console.error('\n[typecheck] TypeScript errors:\n' + formatted);

          return {
            errors: [
              {
                text: 'See TypeScript errors above.',
              },
            ],
          };
        }
      });
    },
  };

  // Tesseract.js includes a reference to remotely hosted code
  // (`worker.min.js`). Remotely hosted code is disallowed in the Chrome Web
  // Store for MV3 extensions. The code never actually loads the remote
  // resource, as it is included in the bundle, but the Chrome Web Store detects
  // a violation anyway, likely using a simple search for a CDN URL in the
  // source files. The remote URL is partially removed, to avoid rejection by
  // the Chrome Web Store.
  /** @type ESBuildPlugin */
  const removeRemoteCodeRefs = {
    name: 'remove remote code references extension',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) {
          fs.writeFileSync(outfile, fs.readFileSync(outfile)
            .toString().replaceAll('https://cdn.jsdelivr.net', ''),
          );
        }
      });
    },
  };

  return {
    entryPoints: [entryPoint.replace(/\.js$/, '.ts')],
    // Since the background script is an ES6 module, it doesn't have to be
    // bundled. Unfortunately, esbuild doesn't behave as one might expect when
    // `bundle` is set to `false`:
    // https://github.com/evanw/esbuild/issues/708. Once this issue has been
    // resolved, `bundle` can be set to `(background.type === 'module')`.
    bundle: true,
    outfile,
    minify: true,
    sourcemap: 'inline',
    plugins: [
      typeScriptPlugin,
      removeRemoteCodeRefs,
      ...(plugin ? [plugin] : [])],
    logLevel: 'warning',
  };
}


/**
 * Create a ZIP archive from the specified directory, and store it at the
 * specified path.
 * @param {string} sourceDir - Folder to compress
 * @param {string} outPath - Output path (ZIP file)
 * @return {Promise<void>}
 */
function zipDirectory(sourceDir, outPath) {
  const archive = archiver('zip', {zlib: {level: 9}});
  const stream = fs.createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    archive
      .directory(sourceDir, false)
      .on('error', (err) => reject(err))
      .pipe(stream)
    ;

    stream.on('close', () => resolve());
    archive.finalize();
  });
}


/**
 * Build function.
 * @param {Browser} browser - Browser to build for
 * @param {boolean} zip - Whether to also zip the built extension
 */
async function build(browser, zip = false) {
  if (browser === 'edge') browser = 'chromium';

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
      await buildIcon(icon, size, browserDist(browser));
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

  if (zip) {
    // For publishing on AMO or the Chrome Web Store, the extension must be
    // zipped.
    const zipFile = path.join(dist, manifest.version + '-' + browser + '.zip');
    console.log(`Zipping built extension to ${zipFile}`);
    await zipDirectory(browserDist(browser), zipFile);
  }
}


/**
 * `fs.watch()` does not work correctly, and often
 * - reports the same event more than once,
 * - incorrectly reports changes as a 'rename', and
 * - as a result doesn't report any future file changes.
 *
 * This custom file watcher context checks if the underlying file has actually
 * changed, and then instantiates a new file watcher to continue keeping track
 * of any changes.
 */
class FileWatcherContext {
  #file;
  #callback;
  /** @type AbortController */
  #abortController;
  /** @type string */
  #fileHash;

  /**
   * @param {string} file - File to be watched
   * @param {function} callback - Function to call if file changes
   */
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
    fs.watch(
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
    }
  }
}


/**
 * Launch browser with extension, watch for changes, rebuild and reload. Assumes
 * that the extension has already been built.
 * @param {Browser} browser - Browser to launch with extension
 */
async function watch(browser) {
  const extensionRunner = await webExt.cmd.run({
    // Options correspond to CLI options.
    // Firefox requires absolute paths.
    sourceDir: path.join(process.cwd(), browserDist(browser)),
    noReload: true,
    target: browser === 'edge' ? 'chromium' : browser,

    // Chromium and MS Edge specific options.
    ...(['chromium', 'edge'].includes(browser) && {
      chromiumProfile: `browser-profiles/${browser}`,
    }),

    // MS Edge specific option.
    ...(browser === 'edge' &&
      {chromiumBinary: '/usr/bin/microsoft-edge-stable'}),

    // Firefox specific settings.
    ...(browser === 'firefox-desktop' && {
      // Firefox requires an absolute paths.
      firefoxProfile: path.join(process.cwd(), 'browser-profiles/firefox'),
      firefox: 'deved',
    }),

    // Options for all desktop browsers.
    ...(['chromium', 'edge', 'firefox-desktop'].includes(browser) && {
      keepProfileChanges: true,
      profileCreateIfMissing: true,
      startUrl: 'https://www.youtube.com/watch?v=9G9liRZvi5E',
    }),

    // Options for Firefox for Android.
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
      contexts.push(context);
    });

    // Watch icons.
    const icons = adaptManifestToBrowser(manifest, browser)?.icons;
    if (icons) {
      for (const [size, icon] of Object.entries(icons)) {
        const context =
            new FileWatcherContext(icon.replace(/\.png$/, '.svg'), async () => {
              await buildIcon(icon, size, browserDist(browser));
              extensionRunner.reloadAllExtensions();
            });
        contexts.push(context);
      }
    }

    // This esbuild plugin is needed to reload the extension if the source files
    // change.
    /** @type {ESBuildPlugin} */
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
    console.log('Changes detected in \'manifest.json\'. Rebuilding.');
    // The contexts created by esbuild have a `dispose` method. To allow for
    // termination of all contexts using this method, `FileWatcherContext` has
    // this method too.
    contexts.forEach((context) => context.dispose());
    cleanDirectory(browserDist(browser));
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

  cleanDirectory();

  if (args.length === 0) {
    // 'firefox-desktop' and 'firefox-android' share the same distributable.
    for (const browser of
    /** @type{Array<Browser>} */ (['chromium', 'firefox'])) {
      const buildMsg = `Building extension for target ${browser}:`;
      console.log(`\n${buildMsg}\n${'='.repeat(buildMsg.length)}`);
      await build(browser, true);
    }
    console.log('\n');
  } else {
    const browser = args[1];
    await build(browser);
    await watch(browser);
  }
}


main();
