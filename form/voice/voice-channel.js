(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceChannel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;
  var KIND = 'cdp-voice';
  var HELPER_ORIGIN = 'https://ob198-cpu.github.io';
  var HELPER_URL = HELPER_ORIGIN + '/suisinbu/form/voice/';
  var MAX_TEXT_LENGTH = 10000;
  var STATUS_CODES = Object.freeze([
    'waiting', 'listening', 'stopped', 'unsupported', 'not-allowed', 'audio-capture',
    'network', 'no-speech', 'aborted', 'service-not-allowed', 'unknown-error',
    'closed', 'transfer-failed', 'cancelled'
  ]);
  var BASE_KEYS = ['kind', 'version', 'channel', 'type'];

  function validChannel(channel) {
    return typeof channel === 'string' && /^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(channel);
  }

  function validateParentOrigin(origin) {
    if (typeof origin !== 'string' || origin.length > 300) return false;
    try {
      var url = new URL(origin);
      return url.protocol === 'https:' && url.origin === origin && !url.port &&
        !url.username && !url.password &&
        (url.hostname === 'script.google.com' ||
          url.hostname === 'script.googleusercontent.com' ||
          /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(url.hostname));
    } catch (_) {
      return false;
    }
  }

  function createNonce(cryptoProvider) {
    var provider = cryptoProvider || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!provider || typeof provider.getRandomValues !== 'function') {
      throw new Error('Secure random source is required');
    }
    var bytes = new Uint8Array(16);
    provider.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function checkConfiguration(channel, origin) {
    if (!validChannel(channel)) throw new Error('Invalid voice channel');
    if (origin !== undefined && !validateParentOrigin(origin)) {
      throw new Error('Invalid form origin');
    }
  }

  function buildHelperUrl(channel, parentOrigin) {
    checkConfiguration(channel, parentOrigin);
    if (!validateParentOrigin(parentOrigin)) throw new Error('Invalid form origin');
    var params = new URLSearchParams();
    params.set('channel', channel);
    params.set('parentOrigin', parentOrigin);
    return HELPER_URL + '#' + params.toString();
  }

  function parseFragment(hash) {
    if (typeof hash !== 'string' || hash.length > 1024) return null;
    var params = new URLSearchParams(hash.charAt(0) === '#' ? hash.slice(1) : hash);
    var keys = Array.from(params.keys());
    if (keys.length !== 2 || params.getAll('channel').length !== 1 ||
        params.getAll('parentOrigin').length !== 1) return null;
    var channel = params.get('channel');
    var origin = params.get('parentOrigin');
    if (!validChannel(channel) || !validateParentOrigin(origin)) return null;
    return { channel: channel, parentOrigin: origin };
  }

  function transport(target, frame, origin) {
    target.postMessage(frame, origin);
  }

  function validWindow(target) {
    return !!target && typeof target.postMessage === 'function';
  }

  function frame(channel, type, payload) {
    return Object.assign({ kind: KIND, version: VERSION, channel: channel, type: type }, payload || {});
  }

  function validFrame(data, channel, type, extra) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        data.kind !== KIND || data.version !== VERSION || data.channel !== channel ||
        data.type !== type) return false;
    var allowed = BASE_KEYS.concat(extra || []);
    var keys = Object.keys(data);
    return keys.length === allowed.length && allowed.every(function (key) {
      return Object.prototype.hasOwnProperty.call(data, key);
    }) && keys.every(function (key) { return allowed.indexOf(key) !== -1; });
  }

  function validText(text) {
    return typeof text === 'string' && text.length <= MAX_TEXT_LENGTH;
  }

  function validSequence(sequence) {
    return Number.isSafeInteger(sequence) && sequence > 0;
  }

  function invoke(callback, a, b) {
    if (typeof callback === 'function') return callback(a, b);
  }

  function createParent(options) {
    var opts = options || {};
    var channel = opts.nonce;
    checkConfiguration(channel, opts.parentOrigin);
    if (!validWindow(opts.helperWindow)) throw new Error('Helper window is required');
    if (typeof opts.onFinal !== 'function') throw new Error('Final text receiver is required');
    var send = opts.send || transport;
    var helper = opts.helperWindow;
    var disposed = false;
    var authorized = false;
    var cancelled = false;
    var lastSequence = 0;
    var acceptedFinal = null;

    function post(type, payload) {
      if (disposed || cancelled) return false;
      try {
        send(helper, frame(channel, type, payload), HELPER_ORIGIN);
        return true;
      } catch (_) {
        return false;
      }
    }

    function authorize() {
      if (disposed || cancelled) return false;
      var first = !authorized;
      authorized = true;
      if (!post('authorize')) {
        authorized = !first;
        return false;
      }
      if (first) invoke(opts.onReady);
      return true;
    }

    function handleMessage(event) {
      if (disposed || cancelled || !event || event.origin !== HELPER_ORIGIN || event.source !== helper) return false;
      var data = event.data;
      if (validFrame(data, channel, 'hello')) return authorize();
      if (!authorized) return false;
      if (validFrame(data, channel, 'status', ['code'])) {
        if (STATUS_CODES.indexOf(data.code) === -1 || acceptedFinal) return false;
        invoke(opts.onStatus, data.code);
        return true;
      }
      var isFinal = validFrame(data, channel, 'final', ['seq', 'text']);
      if (!isFinal && !validFrame(data, channel, 'preview', ['seq', 'text'])) return false;
      if (!validSequence(data.seq) || !validText(data.text)) return false;
      if (acceptedFinal) {
        if (!isFinal || data.seq !== acceptedFinal.seq || data.text !== acceptedFinal.text) return false;
        return post('ack', { seq: data.seq });
      }
      if (data.seq <= lastSequence) return false;
      if (!isFinal) {
        lastSequence = data.seq;
        invoke(opts.onPreview, data.text, { seq: data.seq });
        return true;
      }
      // A failed local receiver must never produce a successful transfer ACK.
      var result;
      try { result = opts.onFinal(data.text, { seq: data.seq }); }
      catch (_) { return false; }
      if (result === false || (result && typeof result.then === 'function')) return false;
      lastSequence = data.seq;
      acceptedFinal = { seq: data.seq, text: data.text };
      return post('ack', { seq: data.seq });
    }

    return Object.freeze({
      handleMessage: handleMessage,
      authorize: authorize,
      stop: function () { return authorized && !acceptedFinal ? post('stop') : false; },
      cancel: function () {
        if (disposed || cancelled) return false;
        post('cancel');
        cancelled = true;
        return true;
      },
      dispose: function () { disposed = true; helper = null; acceptedFinal = null; },
      getState: function () {
        return { authorized: authorized, cancelled: cancelled, disposed: disposed,
          lastSequence: lastSequence, finalized: !!acceptedFinal };
      }
    });
  }

  function createChild(options) {
    var opts = options || {};
    var channel = opts.nonce;
    checkConfiguration(channel, opts.parentOrigin);
    if (!validateParentOrigin(opts.parentOrigin)) throw new Error('Invalid form origin');
    if (!validWindow(opts.openerWindow)) throw new Error('Form opener is required');
    var send = opts.send || transport;
    var opener = opts.openerWindow;
    var origin = opts.parentOrigin;
    var authorized = false;
    var cancelled = false;
    var disposed = false;
    var acknowledged = false;
    var sequence = 0;
    var pendingFinal = null;

    function post(type, payload) {
      if (disposed || cancelled) return false;
      try {
        send(opener, frame(channel, type, payload), origin);
        return true;
      } catch (_) {
        return false;
      }
    }

    function handleMessage(event) {
      if (disposed || cancelled || !event || event.origin !== origin || event.source !== opener) return false;
      var data = event.data;
      if (validFrame(data, channel, 'authorize')) {
        if (authorized) return true;
        authorized = true;
        invoke(opts.onAuthorize);
        return true;
      }
      if (!authorized) return false;
      if (validFrame(data, channel, 'stop')) {
        if (pendingFinal) return false;
        invoke(opts.onStop);
        return true;
      }
      if (validFrame(data, channel, 'cancel')) {
        cancelled = true;
        invoke(opts.onCancel);
        return true;
      }
      if (validFrame(data, channel, 'ack', ['seq'])) {
        if (!pendingFinal || !validSequence(data.seq) || data.seq !== pendingFinal.seq) return false;
        if (!acknowledged) {
          acknowledged = true;
          invoke(opts.onAck, { seq: data.seq });
        }
        return true;
      }
      return false;
    }

    return Object.freeze({
      handleMessage: handleMessage,
      hello: function () { return post('hello'); },
      preview: function (text) {
        if (disposed || cancelled || !authorized || pendingFinal || !validText(text) || sequence === Number.MAX_SAFE_INTEGER) return false;
        sequence += 1;
        return post('preview', { seq: sequence, text: text });
      },
      finalize: function (text) {
        if (disposed || cancelled || !authorized || !validText(text) || acknowledged) return false;
        if (pendingFinal) {
          if (text !== pendingFinal.text) return false;
        } else {
          if (sequence === Number.MAX_SAFE_INTEGER) return false;
          sequence += 1;
          pendingFinal = { seq: sequence, text: text };
        }
        return post('final', pendingFinal);
      },
      status: function (code) {
        return authorized && !pendingFinal && STATUS_CODES.indexOf(code) !== -1 ? post('status', { code: code }) : false;
      },
      dispose: function () { disposed = true; opener = null; pendingFinal = null; },
      getState: function () {
        return { authorized: authorized, cancelled: cancelled, disposed: disposed,
          sequence: sequence, finalPending: !!pendingFinal, acknowledged: acknowledged };
      }
    });
  }

  return Object.freeze({ VERSION: VERSION, HELPER_ORIGIN: HELPER_ORIGIN, HELPER_URL: HELPER_URL,
    MAX_TEXT_LENGTH: MAX_TEXT_LENGTH, STATUS_CODES: STATUS_CODES,
    validateParentOrigin: validateParentOrigin, createNonce: createNonce,
    buildHelperUrl: buildHelperUrl, parseFragment: parseFragment,
    createParent: createParent, createChild: createChild });
});
