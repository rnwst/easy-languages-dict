import {Caption} from './captions.js';
import {YTLanguageCode} from '../../types.js';
import translateWord from './translateWord.js';
import {
  createElement, isTranslatable, isAdShowing, observeAdState,
} from './utils.js';

export function activeCaption(
  cues: Caption[], time: number,
): Caption | undefined {
  // Binary search keeps playback work small even on long videos.
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cues[middle].start <= time) low = middle + 1;
    else high = middle;
  }
  const cue = cues[low - 1];
  return cue && time < cue.end ? cue : undefined;
}

/** Show timed caption lines with words that can be hovered, focused or tapped
 * to request a translation.
 */
export function renderSubtitles(
  player: HTMLElement, video: HTMLVideoElement, captions: Caption[],
  lang: YTLanguageCode, signal: AbortSignal,
): (translated: Caption[]) => void {
  const container = createElement('subtitle-container');
  const original = createElement('original-subtitle');
  const translation = createElement('translated-subtitle');
  const bubble = createElement('translation-bubble');
  bubble.setAttribute('role', 'status');
  bubble.hidden = true;
  container.append(original, translation, bubble);
  player.append(container);
  let translated: Caption[] = [];
  let previous: Caption | undefined;
  let generation = 0;
  let frame = 0;
  let selected: HTMLElement | undefined;
  const closeBubble = () => {
    generation++;
    bubble.hidden = true;
    selected?.classList.remove('selected');
    selected = undefined;
  };
  const positionBubble = () => {
    if (!selected) return;
    const bounds = container.getBoundingClientRect();
    const word = selected.getBoundingClientRect();
    const scaleX = bounds.width / container.offsetWidth || 1;
    const scaleY = bounds.height / container.offsetHeight || 1;
    const center = (word.left + word.width / 2 - bounds.left) / scaleX;
    // Keep the bubble inside the subtitle area and its handle pointing at the
    // selected word. Measure the word on screen, including player resizing.
    bubble.style.setProperty('--dist-to-left-video-edge', `${center}px`);
    bubble.style.setProperty('--dist-to-right-video-edge',
      `${container.clientWidth - center}px`);
    bubble.style.setProperty('--word-top',
      `${(word.top - bounds.top) / scaleY}px`);
  };
  const resizeObserver = new ResizeObserver(positionBubble);
  resizeObserver.observe(container);
  resizeObserver.observe(original);
  const showWord = (button: HTMLElement, words: string[], index: number) => {
    if (selected === button) return;
    closeBubble();
    selected = button;
    button.classList.add('selected');
    const request = generation;
    bubble.classList.remove('error');
    bubble.textContent = 'Loading translation…';
    bubble.hidden = false;
    positionBubble();
    void translateWord(words, index, lang).then((html) => {
      if (!signal.aborted && request === generation) {
        bubble.innerHTML = html;
      }
    }).catch((error: unknown) => {
      if (!signal.aborted && request === generation) {
        bubble.classList.add('error');
        bubble.textContent = error instanceof Error ?
          error.message : String(error);
      }
    });
  };
  const update = () => {
    container.hidden = isAdShowing();
    if (container.hidden) {
      closeBubble();
      return;
    }
    const cue = activeCaption(captions, video.currentTime);
    if (cue !== previous) {
      previous = cue;
      closeBubble();
      original.replaceChildren();
      if (cue) {
        const parts = [...new Intl.Segmenter(lang, {granularity: 'word'})
          .segment(cue.text)];
        const words = parts.filter((part) => part.isWordLike)
          .map((part) => part.segment);
        let index = 0;
        for (const part of parts) {
          if (!part.isWordLike) {
            original.append(document.createTextNode(part.segment));
            continue;
          }
          const wordIndex = index++;
          if (!isTranslatable(part.segment)) {
            original.append(document.createTextNode(part.segment));
            continue;
          }
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'subtitle-word';
          button.textContent = part.segment;
          button.addEventListener('pointerenter', (evt) => {
            if (evt.pointerType !== 'touch') showWord(button, words, wordIndex);
          });
          button.addEventListener('focus', () => {
            showWord(button, words, wordIndex);
          });
          button.addEventListener('click', (evt) => {
            evt.stopPropagation();
            showWord(button, words, wordIndex);
          });
          original.append(button);
        }
      }
    }
    translation.textContent = activeCaption(translated, video.currentTime)
      ?.text ?? '';
  };
  const tick = () => {
    update();
    if (!video.paused && !signal.aborted && !isAdShowing()) {
      frame = requestAnimationFrame(tick);
    }
  };
  const play = () => {
    cancelAnimationFrame(frame);
    tick();
  };
  let playback = new AbortController();
  const bindVideo = () => {
    for (const name of ['timeupdate', 'seeked', 'pause', 'loadedmetadata']) {
      video.addEventListener(name, update, {signal: playback.signal});
    }
    video.addEventListener('play', play, {signal: playback.signal});
  };
  const refreshVideo = () => {
    if (isAdShowing()) return;
    const current = player.querySelector('video');
    if (current && current !== video) {
      playback.abort();
      playback = new AbortController();
      video = current;
      bindVideo();
      play();
    }
  };
  bindVideo();
  const mediaObserver = new MutationObserver(refreshVideo);
  mediaObserver.observe(player, {childList: true, subtree: true});
  observeAdState(() => {
    refreshVideo();
    play();
  }, signal);
  container.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') closeBubble();
  }, {signal});
  player.addEventListener('click', (evt) => {
    if (!container.contains(evt.target as Node)) closeBubble();
  }, {signal});
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    mediaObserver.disconnect();
    playback.abort();
    closeBubble();
    container.remove();
  }, {once: true});
  play();
  return (cues) => {
    translated = cues;
    update();
  };
}
