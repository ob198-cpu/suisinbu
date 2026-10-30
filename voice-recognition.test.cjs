'use strict';

// Offline browser/recognizer doubles; no microphone, network, or real data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function helper() {
  const elements = {}, listeners = {}, messages = [], instances = [];
  const nonce = '1234567890abcdef1234567890abcdef';
  const origin = 'https://example-script.googleusercontent.com';
  class Element {
    constructor() { this.value = ''; this.textContent = ''; this.disabled = true; this.readOnly = true; this.listeners = {}; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ type, target: this, ...event }); }
    click() { if (!this.disabled) this.fire('click', { isTrusted: true }); }
  }
  class Recognition {
    constructor() { instances.push(this); }
    start() { this.onstart?.(); }
    stop() { this.stopped = true; }
    abort() {}
    result(rows, resultIndex = 0) {
      this.onresult?.({ resultIndex, results: rows.map(([text, final]) => Object.assign([{ transcript: text }], { isFinal: final })) });
    }
    end() { this.onend?.(); }
  }
  const document = { getElementById(id) { return elements[id] ||= new Element(); } };
  const opener = { closed: false, postMessage(data) { messages.push(data); } };
  const window = {
    location: { hash: '#channel=' + nonce + '&parentOrigin=' + encodeURIComponent(origin) },
    opener, SpeechRecognition: Recognition, close() {},
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    setTimeout() { return 1; }, clearTimeout() {}
  };
  window.self = window.top = window;
  const context = vm.createContext({ window, document, URL, URLSearchParams, Uint8Array });
  for (const file of ['voice-channel.js', 'helper.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'form', 'voice', file), 'utf8'), context);
    if (file === 'voice-channel.js') window.VoiceChannel = context.VoiceChannel;
  }
  for (const fn of listeners.message || []) fn({ origin, source: opener,
    data: { kind: 'cdp-voice', version: 1, channel: nonce, type: 'authorize' } });
  return {
    element: id => document.getElementById(id),
    start() { document.getElementById('voiceStart').click(); return instances.at(-1); },
    messages
  };
}

test('corrected result snapshot replaces stale text even if resultIndex is wrong', () => {
  const h = helper(), r = h.start();
  r.result([['報告者', true], ['報告者報告者報告者 テスト氏名', false]], 0);
  r.result([['報告者', true], [' テスト氏名', true]], 2);
  assert.equal(h.element('voiceTranscript').value, '報告者 テスト氏名');
});

test('independent segments and intentional repeated words remain intact', () => {
  const h = helper(), r = h.start();
  r.result([['確認 確認 ', true], ['報告者', false]], 0);
  r.result([['確認 確認 ', true], ['報告者 テスト氏名', true]], 1);
  assert.equal(h.element('voiceTranscript').value, '確認 確認 報告者 テスト氏名');
});

test('stop, edit, restart, and return preserve the complete text', () => {
  const h = helper(), first = h.start();
  first.result([['音声', true]]);
  h.element('voiceStop').click();
  assert.equal(first.stopped, true);
  first.end();
  h.element('voiceTranscript').value = '訂正文';
  h.element('voiceTranscript').fire('input');
  const second = h.start();
  second.result([['続き', true]]);
  second.end();
  h.element('voiceReturn').click();
  assert.equal(h.messages.filter(m => m.type === 'final').at(-1).text, '訂正文\n続き');
});
