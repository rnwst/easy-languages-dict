import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {browserTestArgs} from '../../scripts/test-browser.js';
import {productionParsers, validateMetadata, validateNativeCaptions,
  validateTranscript, validatePlayer} from './contracts.js';
import {liveVideos, responseJSON, failure, Unverified, KnownLimitation,
  navigationFailure, nativeCaptionResponses, overallOutcome}
  from './live/support.js';

test('browser runner opts into live checks only with live', () => {
  const offline = browserTestArgs([]);
  assert(offline.includes('__tests__/browser/chromium.test.mjs'));
  assert(offline.includes('__tests__/browser/firefox.test.mjs'));
  assert(!offline.some(arg => arg.includes('/live/')));
  const live = browserTestArgs(['firefox', 'live',
    '--test-name-pattern', 'metadata']);
  assert.deepEqual(live, ['--test', '--test-concurrency=1',
    '--test-name-pattern', 'metadata',
    '__tests__/browser/live/firefox.test.mjs']);
  assert(!live.includes('live'), 'Node must not receive the mode argument');
  assert.equal(browserTestArgs(['live']).filter(arg =>
    arg.endsWith('.test.mjs')).length, 2);
  assert.throws(() => browserTestArgs(['lve']), /Unknown/);
  assert.throws(() => browserTestArgs(['--live']), /Unknown/);
  assert.throws(() => browserTestArgs(['edge']), /Unknown/);
});

test('live video configuration rejects invalid selections', () => {
  assert.deepEqual(liveVideos('Z9PRhksKFqU:pl'),
    [{videoId: 'Z9PRhksKFqU', language: 'pl'}]);
  for (const value of ['', 'not-a-video', 'Z9PRhksKFqU:en',
    'Z9PRhksKFqU:pl,', 'Z9PRhksKFqU:pl:extra']) {
    assert.throws(() => liveVideos(value), /YT_LIVE_VIDEOS/);
  }
});

test('metadata rejects wrong video identity and missing fields', () => {
  const metadata = {videoDetails: {videoId: 'Z9PRhksKFqU'}, captions: {
    playerCaptionsTracklistRenderer: {captionTracks: [{languageCode: 'pl',
      baseUrl: 'https://www.youtube.com/api/timedtext?v=Z9PRhksKFqU'}]},
  }};
  assert.equal(validateMetadata(metadata, 'Z9PRhksKFqU', 'pl').length, 1);
  assert.throws(() => validateMetadata(metadata, 'other-video', 'pl'));
  assert.throws(() => validateMetadata(metadata, 'Z9PRhksKFqU', 'de'));
  metadata.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl =
    'https://example.com/?signed-secret=do-not-log';
  assert.throws(() => validateMetadata(metadata, 'Z9PRhksKFqU'), error =>
    !error.message.includes('do-not-log'));
});

test('caption contracts use the production parser and reject unusable JSON',
  async () => {
    const {parseCaptions} = await productionParsers();
    const data = {events: [{tStartMs: 1000, dDurationMs: 1500,
      segs: [{utf8: 'Real caption shape'}]}]};
    assert.equal(validateNativeCaptions(data, parseCaptions)[0].end, 2.5);
    for (const broken of [{}, {events: []}, {events: [{tStartMs: '1000',
      segs: [{utf8: 'Text'}]}]}, {events: [{tStartMs: 0, segs: {}}]}]) {
      assert.throws(() => validateNativeCaptions(broken, parseCaptions));
    }
  });

test('saved transcript samples obey the same contract as live responses',
  async () => {
    const {parseTranscriptPanel} = await productionParsers();
    for (const language of ['pl', 'en']) {
      const data = JSON.parse(await fs.readFile(new URL(
        `../fixtures/panel-${language}.json`, import.meta.url), 'utf8'));
      const cues = validateTranscript(data, 'Z9PRhksKFqU',
        parseTranscriptPanel);
      assert(cues.length);
      assert.throws(() => validateTranscript(data, 'wrong-video',
        parseTranscriptPanel));
      delete data.frameworkUpdates;
      assert.throws(() => validateTranscript(data, 'Z9PRhksKFqU',
        parseTranscriptPanel));
    }
  });

test('CC contract detects selector and state drift', () => {
  validatePlayer({player: true, video: true, cc: true, pressed: 'false'});
  assert.throws(() => validatePlayer({player: true, video: true, cc: false}));
  assert.throws(() => validatePlayer({player: true, video: true, cc: true,
    pressed: 'enabled'}));
});

test('unavailable live data is never successful compatibility evidence', () => {
  for (const response of [undefined, {status: 429}, {status: 403},
    {status: 500}, {status: 200, body: ''},
    {status: 200, unreadable: true}]) {
    assert.throws(() => responseJSON(response), error =>
      failure(error).outcome === 'unverified');
  }
  assert.throws(() => responseJSON({status: 200, body: '<new format>'}),
    error => failure(error).outcome === 'incompatible');
  assert.deepEqual(responseJSON({status: 200, body: '{"events":[]}'}),
    {events: []});
  assert.deepEqual(failure(new Unverified('rate-limited')),
    {outcome: 'unverified', reason: 'rate-limited'});
  assert(!JSON.stringify(failure(new Error('https://secret/?token=private')))
    .includes('private'));
  assert.deepEqual(failure(navigationFailure(new Error(
    'net::ERR_CONNECTION_RESET at https://secret/?token=private'))), {
    outcome: 'unverified',
    reason: 'navigation-failed:net::ERR_CONNECTION_RESET',
  });
});

test('only completed empty native 200 responses are a known limitation', () => {
  const empty = {status: 200, body: '', complete: true};
  assert.throws(() => nativeCaptionResponses([empty]), KnownLimitation);
  for (const responses of [[], [{...empty, unreadable: true}],
    [{...empty, complete: false}], [{...empty, body: ' '}],
    [empty, {status: 429}], [empty, {status: 500}]]) {
    assert.throws(() => nativeCaptionResponses(responses), Unverified);
  }
  const usable = {...empty, body: '{"events":[]}'};
  assert.deepEqual(nativeCaptionResponses([empty, usable]), [usable]);
});

test('known native limitations never excuse missing or failed live checks',
  () => {
    const report = outcomes => ({setup: 'pass', videos: [{
      checks: outcomes.map(outcome => ({outcome})),
    }]});
    assert.equal(overallOutcome(report(['pass', 'known-limitation']), 2),
      'pass-with-known-limitations');
    assert.equal(overallOutcome(report(['pass', 'pass']), 2), 'pass');
    assert.equal(overallOutcome(report(['known-limitation']), 2),
      'unverified');
    assert.equal(overallOutcome(report(['known-limitation', 'unverified']), 2),
      'unverified');
    const failed = report(['known-limitation', 'incompatible']);
    assert.equal(overallOutcome(failed, 2),
      'incompatible');
  });
