import assert from 'node:assert/strict';
import { PARK_ROAMING_TRACK } from './park-roaming-music.ts';

/** Native media events are queued, pause aborts outstanding play, and the
 * same element may only be attached to one MediaElementAudioSourceNode. */
class Media {
  paused = true; duration = NaN; readyState = 0;
  preload = ''; loop = false; loads = 0; plays = 0; pauses = 0;
  advanceOnPause = 0; seekRequests = [];
  onloadedmetadata = null; ondurationchange = null; onerror = null;
  #src = ''; #requests = []; #generation = 0; #currentTime = 0;

  constructor(options) { this.options = options; }
  get currentTime() { return this.#currentTime; }
  set currentTime(value) { this.seekRequests.push(value); this.#currentTime = value; }
  advance(seconds) { this.#currentTime += seconds; }
  get src() { return this.#src; }
  set src(value) {
    this.#src = value;
    this.#generation++;
  }
  metadata(duration = PARK_ROAMING_TRACK.seconds) {
    this.duration = duration;
    this.readyState = 1;
    this.ondurationchange?.();
    this.onloadedmetadata?.();
  }
  play() {
    assert.ok(this.source, 'play is routed through the shared audio graph');
    assert.ok(this.src);
    this.paused = false;
    this.plays++;
    const generation = this.#generation;
    return new Promise((resolve, reject) => {
      const request = { resolve, reject };
      this.#requests.push(request);
      this.lastPlay = request;
      if (this.options.holdPlay) return;
      queueMicrotask(() => {
        if (this.#generation !== generation || !this.#requests.includes(request)) return;
        if (!this.readyState) this.metadata();
        if (this.#requests.includes(request)) { this.#requests = []; resolve(); }
      });
    });
  }
  pause() {
    if (!this.paused) this.advance(this.advanceOnPause);
    this.paused = true;
    this.pauses++;
    const requests = this.#requests;
    this.#requests = [];
    if (!this.options.deferAborts) requests.forEach(({ reject }) => reject(new DOMException('Paused', 'AbortError')));
  }
  removeAttribute(name) { assert.equal(name, 'src'); this.src = ''; }
  load() {
    this.loads++;
    this.readyState = 0;
    this.duration = NaN;
    this.#currentTime = 0;
  }
}

export function mockRoamingMedia(doc) {
  const media = [], options = { holdPlay: false, deferAborts: false };
  doc.createElement = tag => {
    assert.equal(tag, 'audio');
    const element = new Media(options);
    media.push(element);
    return element;
  };
  return { media, options };
}

export function attachMediaNode(element, node) {
  assert.equal(element.source, undefined, 'one source per media element');
  element.source = node;
  node.mediaElement = element;
  return node;
}
