import fs from 'node:fs/promises';
import {browserName} from './harness.js';
import {productionParsers, validateMetadata, validateNativeCaptions,
  validateTranscript} from './contracts.js';

const videoId = 'abcdefghijk';
export const watchURL = `https://www.youtube.com/watch?v=${videoId}`;

/** Supply local server responses while running the actual extension scripts. */
export async function fixture(browser, t, options = {}) {
  const {scenario = 'normal', initialOn = false, delayed = false,
    translatable = false, englishStatus = 200,
    language = 'de', audioLanguage, existingEnglish = false,
    adStartup = 0, panel = false, panelStatus = 200,
    panelEnglishStatus = 200, emptyEnglish = false,
    panelDelayed = false} = options;
  const version = await browser.version();
  const parsers = await productionParsers();
  const page = await browser.newPage();
  const requests = [];
  const panelRequests = [];
  let releasePanel;
  const panelGate = panelDelayed ? new Promise(r => releasePanel = r) :
    Promise.resolve();
  const logs = [];
  const errors = [];
  let startupFailure;
  const startupFailed = new Promise(resolve => startupFailure = resolve);
  let translationFailure;
  const translationFailed =
    new Promise(resolve => translationFailure = resolve);
  let documents = 0;
  let release;
  const gate = delayed ? new Promise(resolve => release = resolve) :
    Promise.resolve();
  t.after(async () => {
    if (!t.passed) t.diagnostic(JSON.stringify({
      browser: version, scenario, requests, panelRequests,
      logs, errors, documents,
    }));
    release?.();
    releasePanel?.();
    if (!page.isClosed()) await page.close();
  });
  await page.setViewport({width: 800, height: 600});
  const metadata = {
    videoDetails: {videoId},
    captions: {playerCaptionsTracklistRenderer: {captionTracks: [{
      languageCode: language, isTranslatable: translatable,
      ...(panel ? {vssId: '.' + language} : {}),
      baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}` +
        `&lang=${language}&signature=stale&ei=stale` +
        '&expire=stale&sparams=v,ei,expire',
    }]}},
  };
  if (existingEnglish) {
    metadata.captions.playerCaptionsTracklistRenderer.captionTracks.push({
      languageCode: 'en-GB', isTranslatable: false,
      ...(panel ? {vssId: '.en'} : {}),
      baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-GB`,
    });
  }
  if (audioLanguage || existingEnglish) {
    metadata.captions.playerCaptionsTracklistRenderer.audioTracks = [{
      audioTrackId: `${audioLanguage ?? language}.0`, captionTrackIndices: [0],
    }];
  }
  validateMetadata(metadata, videoId, language);
  const nativeURL = `/api/timedtext?v=${videoId}&` +
    `lang=${scenario === 'fresh-signature' ? 'en' : language}` +
    '&signature=fresh&ei=fresh&expire=fresh&sparams=v,ei,expire' +
    (scenario === 'tokenless' ? '' : '&pot=fixture');
  const earlyEmpty = scenario === 'early-empty-native';
  const reopen = scenario === 'early-reopened-native';
  const early = initialOn || scenario === 'cached-native';
  const initialization = {
    'late-metadata':
      'setTimeout(()=>window.ytInitialPlayerResponse=metadata,1000);',
    'early-metadata': "fetch('/youtubei/v1/player',{method:'POST'});",
    'late-caption-metadata':
      'window.ytInitialPlayerResponse={videoDetails:metadata.videoDetails};' +
      "setTimeout(()=>fetch('/youtubei/v1/player',{method:'POST'}),1000);",
    'player-snapshot': '',
  }[scenario] ?? 'window.ytInitialPlayerResponse=metadata;';
  const playerSnapshot = scenario === 'player-snapshot' ?
    "document.querySelector('#movie_player')" +
      '.getPlayerResponse=()=>metadata;' : '';
  const html = `<!doctype html><html lang="en"><head><style>
    body{margin:20px;background:#111}#movie_player{position:relative;
    width:100%;height:425px;background:#345}video{width:100%;height:425px}
    .ytp-subtitles-button{position:absolute;top:0;left:0}
    .ytp-caption-window-container{position:absolute;top:60px;color:white}
    </style><script>
    const metadata=${JSON.stringify(metadata)};
    window.ytcfg={get:()=>({client:{clientName:'WEB'}})};
    window.fixtureMessages=[];window.trustedClicks=[];
    window.trustedKeys=[];window.starts=0;window.captionClicks=0;
    window.reopenAbortEvents=0;
    window.captionDecorated=${!earlyEmpty};
    window.earlyReadyState=null;
    let repeatedSnapshot=false;
    let currentRequest;
    function startCaptions(){
      starts++;
      if(${scenario === 'panel-timeout'})return;
      const xhr=new XMLHttpRequest();currentRequest=xhr;
      if(${reopen}&&starts===1)
        xhr.addEventListener('abort',()=>window.reopenAbortEvents++);
      if(${scenario === 'synchronous-abort'}&&starts===1)
        xhr.addEventListener('loadstart',()=>xhr.abort(),{once:true});
      const url=${JSON.stringify(nativeURL.replace('&pot=fixture', ''))}+
        (${scenario !== 'tokenless'}&&window.captionDecorated?
          '&pot=fixture':'')+(window.manualRecovery?'&manual=1':'');
      xhr.open('GET',url+(${reopen}&&starts===1?'&abandoned=1':''));
      xhr.send();
      if(${reopen}&&starts===1)setTimeout(()=>{
        xhr.open('GET','/reopened-without-send');
      },100);
    }
    addEventListener('message',e=>{
      if(e.data?.origin==='EASY_LANGUAGES_DICT_EXT')
        fixtureMessages.push(e.data.type);
      if(${earlyEmpty}&&!repeatedSnapshot&&
          e.data?.type==='CAPTION_STATE_REQUEST'){
        repeatedSnapshot=true;postMessage(e.data,location.origin);
      }
    });
    ${initialization}
    ${earlyEmpty ? 'setTimeout(()=>window.captionDecorated=true,1200);' : ''}
    ${early ?
    'window.earlyReadyState=document.readyState;startCaptions();' : ''}
    </script>${early || scenario === 'early-metadata' ?
    '<script src="/hold.js"></script>' : ''}</head><body>
    <div id="movie_player" class="${adStartup ? 'ad-showing' : ''}">
    <video></video>
    <button class="ytp-subtitles-button" aria-pressed="${initialOn}">CC</button>
    <div class="ytp-caption-window-container" ${initialOn ? '' : 'hidden'}>
      <span class="ytp-caption-segment">Native caption</span></div></div>
    <script>
    const button=document.querySelector('button');
    const native=document.querySelector('.ytp-caption-window-container');
    ${playerSnapshot}
    let ready=${scenario !== 'late-controls'};
    if(!ready)setTimeout(()=>ready=true,5000);
    button.addEventListener('click',e=>{
      if(!ready)return;
      captionClicks++;
      if(e.isTrusted)trustedClicks.push('click');
      const on=button.getAttribute('aria-pressed')!=='true';
      button.setAttribute('aria-pressed',String(on));native.hidden=!on;
      if(on)startCaptions();else currentRequest?.abort();
    });
    document.addEventListener('keydown',e=>{
      if(e.code==='KeyC'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        if(e.isTrusted)trustedKeys.push(e.code);
        button.click();
      }
    });
    if(${Boolean(adStartup)}){
      window.adVideo=document.querySelector('video');
      const ad=new XMLHttpRequest();
      ad.open('GET','/api/timedtext?v=advertisement&lang=de&tlang=pl');
      ad.send();
      setTimeout(()=>{
        const player=document.createElement('div');player.id='movie_player';
        const video=document.createElement('video');video.currentTime=12;
        player.append(video,button,native);
        document.querySelector('#movie_player').replaceWith(player);
        window.adFinished=true;
      },${adStartup});
    }
    </script></body></html>`;
  const log = text => {
    logs.push(text);
    if (text.includes('No usable native captions arrived')) startupFailure();
    if (text.includes('English captions unavailable')) translationFailure();
  };
  if (browserName(browser) === 'chromium') {
    // CDP also reports isolated-script warnings missed by page.on('console').
    const cdp = await page.createCDPSession();
    cdp.on('Runtime.consoleAPICalled', event => log(event.args
      .map(arg => arg.value ?? arg.description ?? '').join(' ')));
    await cdp.send('Runtime.enable');
  } else {
    page.on('console', message => log(message.text()));
  }
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    try {
      const url = new URL(request.url());
      if (url.pathname === '/watch' && request.isNavigationRequest()) {
        documents++;
        await request.respond({contentType: 'text/html', body: html});
      } else if (url.pathname === '/hold.js') {
        await new Promise(resolve => setTimeout(resolve, 600));
        await request.respond({contentType: 'text/javascript', body: ''});
      } else if (url.pathname === '/youtubei/v1/player') {
        await request.respond({contentType: 'application/json',
          body: JSON.stringify(metadata)});
      } else if (url.pathname === '/youtubei/v1/get_panel') {
        const body = JSON.parse(await request.fetchPostData());
        panelRequests.push(body);
        await panelGate;
        const english = Buffer.from(body.params, 'base64').includes('.en');
        const status = english ? panelEnglishStatus : panelStatus;
        const data = await fs.readFile(new URL(
          `../fixtures/panel-${english ? 'en' : 'pl'}.json`, import.meta.url),
        'utf8');
        if (status === 200) {
          validateTranscript(JSON.parse(data), 'Z9PRhksKFqU',
            parsers.parseTranscriptPanel);
        }
        await request.respond({status, contentType: 'application/json',
          body: status === 200 ? data.replaceAll('Z9PRhksKFqU', videoId) : ''});
      } else if (url.pathname === '/api/timedtext') {
        requests.push(Object.fromEntries(url.searchParams));
        if (url.searchParams.has('abandoned')) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        await gate;
        if (aborted(request)) return;
        const bad = scenario === 'fresh-signature' &&
          url.searchParams.get('signature') !== 'fresh';
        const empty = scenario === 'panel-empty' ||
          (emptyEnglish && url.searchParams.get('lang') === 'en-GB') ||
          (scenario === 'late-manual' &&
          !url.searchParams.has('manual')) ||
          (earlyEmpty && !url.searchParams.has('pot'));
        const english = url.searchParams.get('tlang') === 'en' ||
          (existingEnglish && url.searchParams.get('lang') === 'en-GB');
        const status = url.searchParams.get('v') === 'advertisement' ? 429 :
          bad ? 403 : english ? englishStatus : 200;
        const data = {events: [
          {tStartMs: 0, dDurationMs: 10000, segs: [{utf8: english ?
            'Hello world' :
            'Hallo Welt und mehrere weitere Worte bis zum letzten Wort'}]},
          {tStartMs: 10000, dDurationMs: 50000,
            segs: [{utf8: english ? 'Second line' : 'Zweite Zeile'}]},
        ]};
        if (status === 200 && !empty) {
          validateNativeCaptions(data, parsers.parseCaptions);
        }
        await request.respond({status, contentType: 'application/json',
          body: status !== 200 || empty ? '' : JSON.stringify(data)});
      } else {
        // Nothing escapes to YouTube, favicon servers, or other web origins.
        await request.respond({status: 204, body: ''});
      }
    } catch (error) {
      if (!page.isClosed() && !aborted(request)) {
        errors.push(String(error));
      }
    }
  });
  return {page, requests, panelRequests, logs, errors, startupFailed,
    translationFailed, releasePanel: () => releasePanel?.(),
    release: () => release?.(),
    documents: () => documents,
    open: () => page.goto(watchURL, {waitUntil: 'load'}),
    mounted: () => page.waitForSelector('.subtitle-word', {timeout: 15000})};
}

function aborted(request) {
  return /^(net::ERR_ABORTED|NS_BINDING_ABORTED)$/.test(
    request.failure()?.errorText ?? '');
}
