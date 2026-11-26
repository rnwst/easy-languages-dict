import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildFixtures, launch, install} from '../harness.js';
import {productionParsers, validateMetadata, validateNativeCaptions,
  validateTranscript, readPlayerState, validatePlayer} from '../contracts.js';
import {Unverified, KnownLimitation, liveVideos, until, untilContent,
  responseJSON,
  observePage, pageMetadata, availability, failure, navigationFailure,
  nativeCaptionResponses, overallOutcome, clickNativeCC, clickControl}
  from './support.js';

export function liveSuite(browserName) {
  const videos = liveVideos();
  const report = {mode: 'live', browser: browserName,
    started: new Date().toISOString(),
    version: null, setup: 'unverified', videos: []};
  let artifacts;
  let browser;
  let parsers;

  before(async t => {
    artifacts = await buildFixtures(browserName, undefined, {live: true});
    browser = await launch(artifacts.directory, browserName);
    report.version = await browser.version();
    t.diagnostic(`LIVE YouTube checks: ${report.version}`);
    await install(browser, artifacts.production);
    parsers = await productionParsers();
    report.setup = 'pass';
  }, {timeout: 120000});

  after(async () => {
    try {
      await browser?.close();
    } finally {
      if (artifacts) {
        await fs.rm(artifacts.directory, {recursive: true, force: true});
      }
      const directory = process.env.YT_LIVE_REPORT_DIR ??
        path.join(os.tmpdir(), 'eld-live-reports');
      report.outcome = overallOutcome(report, videos.length * 8);
      await fs.mkdir(directory, {recursive: true});
      const file = path.join(directory, `${browserName}.json`);
      await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n');
      console.log(`Sanitized live report: ${file}`);
    }
  });

  for (const video of videos) {
    test(`${browserName}: live YouTube ${video.videoId} (${video.language})`,
      {timeout: 300000}, async t => {
        const result = {...video, checks: [], responses: []};
        report.videos.push(result);
        const page = await browser.newPage();
        page.setDefaultTimeout(20000);
        t.after(async () => { if (!page.isClosed()) await page.close(); });
        await page.setViewport({width: 1280, height: 900});
        const capture = await observePage(page);
        t.after(async () => {
          result.responses = capture.summary();
          t.diagnostic(JSON.stringify(result));
          await capture.close();
        });
        const check = async (name, run, timeout = 90000) => {
          let passed = false;
          await t.test(name, {timeout}, async subtest => {
            try {
              const details = await run();
              result.checks.push({name, outcome: 'pass', ...details});
              passed = true;
            } catch (error) {
              if (error instanceof KnownLimitation) {
                result.checks.push({name, outcome: 'known-limitation',
                  reason: error.message});
                subtest.skip(`Known YouTube limitation: ${error.message}; ` +
                  'native payload unverified; fallback checks still required');
                return;
              }
              const outcome = failure(error);
              result.checks.push({name, ...outcome});
              // Raw automation errors can contain signed URLs or session data.
              // eslint-disable-next-line preserve-caught-error
              throw new Error(`${outcome.outcome}: ${outcome.reason}`);
            }
          });
          return passed;
        };

        const opened = await check('live page availability', async () => {
          let response;
          try {
            response = await page.goto(
              `https://www.youtube.com/watch?v=${video.videoId}&hl=en`,
              {waitUntil: 'domcontentloaded', timeout: 30000});
          } catch (error) {
            throw navigationFailure(error);
          }
          if (!response?.ok()) {
            throw new Unverified(`document-http-${response?.status() ?? 0}`);
          }
          await availability(page);
        });
        if (!opened) return;

        let tracks;
        await check('metadata and MAIN/ISOLATED bridge contract', async () => {
          const metadata = await until(async () => {
            const value = await page.evaluate(pageMetadata, video.videoId);
            return value?.captions && value;
          }, 20000);
          await availability(page);
          tracks = validateMetadata(metadata, video.videoId, video.language);
          const bridged = await until(() => page.evaluate(id =>
            window.__eldLive.metadata.find(value =>
              value?.videoDetails?.videoId === id && value.captions),
          video.videoId), 10000);
          validateMetadata(bridged, video.videoId, video.language);
          assert.deepEqual(bridged.captions.playerCaptionsTracklistRenderer
            .captionTracks.map(track => track.languageCode).sort(),
          tracks.map(track => track.languageCode).sort(),
          'The extension must observe the native player caption languages');
          return {tracks: tracks.length};
        });

        const controls = await check('player and trusted native CC control',
          async () => {
            const state = await until(async () => {
              const state = await page.evaluate(readPlayerState);
              return state.video && state.cc && state;
            }, 15000);
            await availability(page);
            validatePlayer(state ?? {});
            await page.hover('#movie_player');
            await page.evaluate(() => {
              document.querySelector('#movie_player video').muted = true;
            });
            if (await page.$eval('#movie_player video', v => v.paused)) {
              await clickControl(page, '#movie_player .ytp-play-button');
            }
            const content = await untilContent(page, () => true);
            if (!content) throw new Unverified('ad-did-not-finish');
            await page.hover('#movie_player');
            // YouTube may turn CC back off after an empty download. Observe
            // the transition rather than requiring it to remain enabled.
            await clickNativeCC(page);
            if ((await page.evaluate(readPlayerState)).pressed === 'false') {
              await clickNativeCC(page);
            }
          });

        let sourceCues;
        await check('native timedtext response contract', async () => {
          if (!controls) throw new Unverified('player-prerequisite');
          const native = () => capture.responses.filter(entry =>
            entry.kind === 'native' && entry.videoId === video.videoId &&
            entry.complete);
          await until(() => native().length, 30000);
          const responses = native();
          if (responses.some(entry => entry.status === 200)) {
            assert(await until(() => page.evaluate(id =>
              window.__eldLive.native.some(value => value.videoId === id &&
                value.status === 200 && value.outcome === 'load'),
            video.videoId),
            5000), 'The extension must observe native caption responses');
          }
          const successful = nativeCaptionResponses(responses);
          for (const entry of successful) {
            const cues = validateNativeCaptions(responseJSON(entry),
              parsers.parseCaptions);
            if (!entry.translated &&
                entry.lang?.split('-')[0] === video.language.split('-')[0]) {
              sourceCues = cues;
            }
          }
          return {responses: successful.length};
        });

        for (const language of [video.language, 'en']) {
          const name = `transcript response contract (${language})`;
          await check(name, async () => {
            if (!tracks) throw new Unverified('metadata-prerequisite');
            const track = tracks.filter(track =>
              track.languageCode.split('-')[0] === language.split('-')[0])
              .sort((a, b) => Number(a.kind === 'asr') -
                Number(b.kind === 'asr'))[0];
            if (!track) throw new Unverified('configured-track-unavailable');
            assert(typeof track.vssId === 'string' && track.vssId,
              'Transcript selection requires the actual track vssId');
            const operationId = `live-${language}`;
            await page.evaluate(({videoId, track, operationId}) => {
              window.postMessage({origin: 'EASY_LANGUAGES_DICT_EXT',
                type: 'TRANSCRIPT_PANEL_REQUEST', content: {operationId,
                  videoId, vssId: track.vssId, languageCode: track.languageCode,
                  kind: track.kind ?? ''}}, location.origin);
            }, {videoId: video.videoId, track, operationId});
            const response = await until(() => page.evaluate(id =>
              window.__eldLive.panel.find(value => value.operationId === id),
            operationId), 15000);
            assert(response, 'The page bridge must answer transcript requests');
            if (response.outcome === 'rate-limited') {
              throw new Unverified('rate-limited');
            }
            const params = parsers.encodePanelParams(video.videoId,
              track.vssId);
            const matches = entry => {
              try {
                return entry.kind === 'panel' && entry.complete &&
                  Buffer.from(decodeURIComponent(entry.params), 'base64')
                    .equals(Buffer.from(params, 'base64'));
              } catch { return false; }
            };
            const entry = await until(() => capture.responses.find(matches),
              5000);
            const cues = validateTranscript(responseJSON(entry), video.videoId,
              parsers.parseTranscriptPanel);
            assert.equal(response.outcome, 'success',
              'The extension must parse the successful transcript response');
            if (language === video.language && !sourceCues) sourceCues = cues;
            return {cues: cues.length};
          });
        }

        const rendered = await check('live source subtitle rendering',
          async () => {
            if (!sourceCues) {
              throw new Unverified('source-captions-prerequisite');
            }
            const media = await until(() => page.$eval('#movie_player video',
              video => video.readyState > 0), 10000);
            if (!media) throw new Unverified('media-unavailable');
            // Acquisition may still be waiting for its native-caption deadline.
            await page.waitForSelector('.subtitle-container', {timeout: 40000});
            // Use YouTube's own seek shortcut so its media buffering controller
            // follows the seek. Direct currentTime assignment can stall MSE.
            await page.focus('#movie_player');
            await page.keyboard.press('1');
            const matched = await until(() => page.evaluate(cues => {
              const video = document.querySelector('#movie_player video');
              const time = video.currentTime;
              const cue = cues.find(cue => cue.start <= time && time < cue.end);
              const nodes = document.querySelectorAll('.subtitle-container');
              // Caption timing is meaningful during buffering too. Observe
              // the real clock and rendered text together, not a later sample
              // after media delivery may have reset the player's clock.
              return time >= video.duration * 0.09 && cue &&
                nodes.length === 1 && !nodes[0].hidden &&
                nodes[0].querySelector('.original-subtitle')?.textContent
                  .replace(/\s+/g, ' ').trim() ===
                    cue.text.replace(/\s+/g, ' ').trim();
            }, sourceCues), 20000);
            if (!matched && await page.$eval('#movie_player video',
              video => Boolean(video.error) || video.readyState === 0)) {
              throw new Unverified('media-unavailable');
            }
            assert(matched,
              'Exactly one overlay must render text from the real response');
          });

        await check('real YouTube SPA navigation and remount', async () => {
          if (!rendered) throw new Unverified('rendering-prerequisite');
          await page.$eval('.subtitle-container', node => {
            node.dataset.liveOldUi = '1';
          });
          const initial = await page.evaluate(() => ({
            timeOrigin: performance.timeOrigin, finish: window.__eldLive.finish,
          }));
          await clickControl(page, 'ytd-masthead a#logo');
          assert(await until(() => page.evaluate(() =>
            location.pathname === '/' &&
              !document.querySelector('.subtitle-container')), 20000),
          'YouTube home navigation must remove the overlay');
          await page.goBack({waitUntil: 'domcontentloaded', timeout: 20000});
          assert(await untilContent(page, () => page.evaluate(id =>
            new URL(location.href).searchParams.get('v') === id &&
              document.querySelectorAll('.subtitle-container').length === 1 &&
              !document.querySelector('[data-live-old-ui]'), video.videoId)),
          'Back navigation must remount exactly one fresh overlay');
          const final = await page.evaluate(() => ({
            timeOrigin: performance.timeOrigin, finish: window.__eldLive.finish,
            start: window.__eldLive.start,
          }));
          assert.equal(final.timeOrigin, initial.timeOrigin,
            'The live check must exercise same-document navigation');
          assert(final.start > 0 && final.finish > initial.finish,
            'YouTube must emit the navigation events modeled by the fixture');
        }, 150000);
      });
  }
}
