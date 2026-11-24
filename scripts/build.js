// @ts-check
'use strict';

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import ts from 'typescript';
import crypto from 'crypto';
import webExt from 'web-ext';
// See https://github.com/import-js/eslint-plugin-import/issues/1810.
import * as adbUtils from 'web-ext/util/adb';
import {optimize as optimizeSVG} from 'svgo';
import {convert as svg2png} from 'convert-svg-to-png';
import {executablePath} from 'puppeteer';
import archiver from 'archiver';
import {watchBuild, refreshDevelopmentTabs} from './watch-build.js';


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
  manifestV2.background = {...manifestV3.background};
  manifestV2.background.scripts = [manifestV3.background.service_worker];
  delete manifestV2.background.service_worker;
  delete manifestV2.background.type;
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
        chromiumManifest.icons[size] = path.join(
          path.dirname(chromiumManifest.icons[size]), `${size}.png`,
        );
      }
    }
    return chromiumManifest;
  }
  if (browser.match('firefox')) {
    // This project currently uses an MV2 background script for Firefox.
    // Moving that build to MV3 needs separate compatibility testing; Firefox
    // supports MV3, but its background and permission behavior differs.
    const firefoxManifest = convertMV3ToMV2(manifest);
    // Firefox scales the shared SVG source to the requested icon size.
    delete firefoxManifest.icons['128'];
    return firefoxManifest;
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
    if (contentScript.css?.length) {
      files.push(...contentScript.css);
    }
  }
  // Web accessible resources.
  const webAccessibleResources = manifest.web_accessible_resources;
  for (const webAccessibleResource of webAccessibleResources) {
    for (const resource of webAccessibleResource.resources) {
      files.push(resource);
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
 * Copy a resource into the output directory when it is missing or has changed.
 * A missing source file fails the build, so the development browser keeps the
 * previous complete extension instead of loading an incomplete replacement.
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
    throw new Error(`Cannot copy missing extension resource: ${file}`);
  }
}


/**
 * For Firefox, which accepts SVG icons, optimize SVGs before copying, and for
 * Chromium, which doesn't accept SVGs, convert SVGs to PNGs.
 * @param {string} svgIcon - Editable SVG source, shared across output sizes
 * @param {string} icon - Output icon file
 * @param {string} size - Icon size in pixels
 * @param {string} distDir - Directory of output file
 */
async function buildIcon(svgIcon, icon, size, distDir) {
  const regex = /\.(?<ext>(svg|png))$/;
  const fileEnding = icon.match(regex).groups['ext'];

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
    name: 'type-check',
    setup(build) {
      build.onStart(() => {
        const config = JSON.parse(fs.readFileSync('tsconfig.json').toString());
        // For building purposes, ignore tests.
        config.exclude = (config.exclude ?? []).concat(['__tests__']);
        const parsedConfig =
          ts.parseJsonConfigFileContent(config, ts.sys, '.',);

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
 * @param {string} distDir - Output directory
 * @param {boolean} development - Enable development-only tab refresh
 */
export async function build(browser, zip = false,
  distDir = browserDist(browser), development = false) {
  if (browser === 'edge') browser = 'chromium';

  const manifest = readManifest();
  const browserSpecificManifest = adaptManifestToBrowser(manifest, browser);
  const refreshTabs = development && browser === 'chromium';
  if (refreshTabs) {
    // Development builds need permission to find and refresh YouTube tabs.
    browserSpecificManifest.host_permissions.push(
      'https://www.youtube.com/*', 'https://m.youtube.com/*',
    );
  }
  writeManifest(browserSpecificManifest, distDir);

  const filesToBeSynced = getFilesToBeSynced(manifest);
  filesToBeSynced.forEach((file) => sync(file, distDir));

  // Build icons.
  const icons = browserSpecificManifest?.icons;
  if (icons) {
    for (const [size, icon] of Object.entries(icons)) {
      await buildIcon(manifest.icons[size], icon, size, distDir);
    }
  }

  // Build content scripts.
  const contentScripts = manifest.content_scripts;
  for (const contentScript of contentScripts) {
    for (const script of contentScript.js) {
      console.log(`Building content script ${script} using esbuild`);
      await esbuild.build(esbuildOptions(script, distDir));
    }
  }

  // Build background script.
  const serviceWorker = manifest.background?.service_worker;
  if (serviceWorker) {
    console.log(`Building background script ${serviceWorker} using esbuild`);
    const options = esbuildOptions(serviceWorker, distDir);
    if (refreshTabs) {
      options.footer = {js: `(${refreshDevelopmentTabs.toString()})();`};
    }
    await esbuild.build(options);
  }

  if (zip) {
    // For publishing on AMO or the Chrome Web Store, the extension must be
    // zipped.
    const zipFile = path.join(dist, manifest.version + '-' + browser + '.zip');
    console.log(`Zipping built extension to ${zipFile}`);
    await zipDirectory(distDir, zipFile);
  }
}


/**
 * Describe the current source files and resources listed in the manifest.
 * Checking file contents also catches editor saves that replace the whole file,
 * which can break a watcher attached to the old file.
 * @return {string} String used to detect changed input files
 */
function sourceSnapshot() {
  const files = new Set(['manifest.json', 'tsconfig.json']);
  for (const entry of fs.readdirSync('.', {withFileTypes: true})) {
    if (entry.isFile() && entry.name.endsWith('.ts')) files.add(entry.name);
  }
  const collect = (directory) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else files.add(file);
    }
  };
  for (const directory of ['content', 'background', 'icons']) {
    collect(directory);
  }
  try {
    const manifest = readManifest();
    for (const file of getFilesToBeSynced(manifest)) files.add(file);
    for (const icon of Object.values(manifest.icons ?? {})) files.add(icon);
  } catch {
    // Keep checking the manifest file even when its JSON is invalid, so fixing
    // it triggers another build.
  }
  return JSON.stringify([...files].sort().map((file) => [
    file, fs.existsSync(file) ? hashFile(file) : null,
  ]));
}


/**
 * Launch browser with extension, watch for changes, rebuild and reload. Assumes
 * that the extension has already been built.
 * @param {Browser} browser - Browser to launch with extension
 * @param {string} initial - Revision built before browser startup
 */
async function watch(browser, initial) {
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

  const staging = browserDist(browser) + '-staging';
  const stop = watchBuild({
    initial,
    snapshot: sourceSnapshot,
    build: async () => {
      cleanDirectory(staging);
      await build(browser, false, staging, true);
    },
    publish: async () => {
      // Only replace the browser's files after the whole build succeeds. Keep
      // the same output path because Chrome uses it to identify the extension.
      fs.rmSync(browserDist(browser), {recursive: true});
      fs.renameSync(staging, browserDist(browser));
      await extensionRunner.reloadAllExtensions();
    },
    onError: (error) => console.error('Development rebuild failed:', error),
  });
  extensionRunner.registerCleanup(stop);
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
    const initial = sourceSnapshot();
    await build(browser, false, browserDist(browser), true);
    await watch(browser, initial);
  }
}


const entryPoint = process.argv[1] && path.resolve(process.argv[1]);
const scriptPath = fileURLToPath(import.meta.url);
// npm scripts invoke `node scripts/build`, relying on Node's .js resolution.
if (entryPoint === scriptPath || `${entryPoint}.js` === scriptPath) {
  main();
}
