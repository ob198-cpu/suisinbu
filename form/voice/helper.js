(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var startButton = $('voiceStart');
  var stopButton = $('voiceStop');
  var returnButton = $('voiceReturn');
  var closeButton = $('voiceClose');
  var transcript = $('voiceTranscript');
  var status = $('voiceStatus');
  var channel = null;
  var authorized = false;
  var disposed = false;
  var acknowledged = false;
  var fatal = false;
  var recognizer = null;
  var busy = false;
  var stopping = false;
  var finalAfterStop = false;
  var pendingText = null;
  var waitingAck = false;
  var helloTimer = null;
  var connectionTimer = null;
  var openerTimer = null;
  var ackTimer = null;
  var errorTimer = null;
  var currentError = '';
  var initialText = '';
  var recognitionText = [];
  var maxLength = 10000;

  function showStatus(text, error, code) {
    status.textContent = text;
    status.className = error ? 'status error' : 'status';
    if (channel && code) channel.status(code);
  }

  function render() {
    var locked = disposed || fatal || acknowledged || pendingText !== null;
    startButton.disabled = !authorized || locked || busy;
    stopButton.disabled = !authorized || locked || !busy || stopping;
    transcript.readOnly = !authorized || disposed || fatal || busy || pendingText !== null || acknowledged;
    returnButton.disabled = !authorized || disposed || fatal || busy || acknowledged || waitingAck ||
      (pendingText === null && !transcript.value.trim());
  }

  function clearTimer(name) {
    if (name !== null) window.clearTimeout(name);
  }

  function stopTimers() {
    clearTimer(helloTimer);
    clearTimer(connectionTimer);
    clearTimer(openerTimer);
    clearTimer(ackTimer);
    clearTimer(errorTimer);
  }

  function abortRecognition() {
    var active = recognizer;
    recognizer = null;
    busy = false;
    stopping = false;
    if (active) {
      active.onresult = active.onend = active.onerror = active.onstart = null;
      try { active.abort(); } catch (_) {}
    }
  }

  function dispose(cancelled) {
    if (disposed) return;
    if (cancelled && channel && !acknowledged) channel.status('cancelled');
    disposed = true;
    stopTimers();
    abortRecognition();
    if (channel) channel.dispose();
    render();
  }

  function close(cancelled) {
    dispose(cancelled);
    window.close();
  }

  function sendPreview() {
    if (channel && !disposed && pendingText === null) channel.preview(transcript.value);
  }

  function errorText(code) {
    var messages = {
      'not-allowed': 'マイクの使用が許可されませんでした。',
      'service-not-allowed': '音声認識の使用が許可されませんでした。',
      'audio-capture': 'マイクを利用できませんでした。',
      'network': '音声認識の通信に失敗しました。',
      'no-speech': '音声を認識できませんでした。',
      'aborted': '音声入力を中断しました。'
    };
    return messages[code] || '音声入力を開始できませんでした。';
  }

  function finalize() {
    if (!channel || !authorized || disposed || fatal || busy || acknowledged || waitingAck) return;
    var text = pendingText === null ? transcript.value : pendingText;
    if (text.length > maxLength) {
      showStatus('文字起こしが10,000文字を超えています。', true);
      return;
    }
    pendingText = text;
    waitingAck = true;
    showStatus('フォームへ戻しています…', false);
    render();
    var sent = false;
    try { sent = channel.finalize(text); } catch (_) {}
    if (acknowledged || disposed) return;
    if (!sent) {
      waitingAck = false;
      showStatus('フォームへ戻せませんでした。', true);
      render();
      return;
    }
    ackTimer = window.setTimeout(function () {
      if (disposed || acknowledged) return;
      waitingAck = false;
      showStatus('フォームへの転送を確認できませんでした。', true);
      render();
    }, 3500);
  }

  function ended(active) {
    if (recognizer !== active || disposed) return;
    clearTimer(errorTimer);
    errorTimer = null;
    recognizer = null;
    busy = false;
    stopping = false;
    sendPreview();
    if (currentError) showStatus(currentError, true);
    else showStatus('音声入力を停止しました。', false, 'stopped');
    render();
    if (finalAfterStop) { finalAfterStop = false; finalize(); }
  }

  function requestStop(returnWhenStopped) {
    if (disposed || acknowledged || pendingText !== null) return;
    if (returnWhenStopped) finalAfterStop = true;
    if (!busy || !recognizer) {
      if (finalAfterStop) { finalAfterStop = false; finalize(); }
      return;
    }
    if (stopping) return;
    stopping = true;
    showStatus('音声入力を停止中…', false);
    render();
    try { recognizer.stop(); }
    catch (_) {
      var active = recognizer;
      currentError = '音声入力を停止できませんでした。';
      try { active.abort(); } catch (_) {}
      ended(active);
    }
  }

  function start(event) {
    if (!event || event.isTrusted !== true || !authorized || disposed || fatal || busy ||
        acknowledged || pendingText !== null) return;
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      showStatus('このブラウザーは音声入力に対応していません。', true, 'unsupported');
      return;
    }
    var active;
    try { active = new Recognition(); }
    catch (_) {
      showStatus('音声入力を開始できませんでした。', true, 'unknown-error');
      return;
    }
    recognizer = active;
    busy = true;
    stopping = false;
    finalAfterStop = false;
    currentError = '';
    initialText = transcript.value;
    recognitionText = [];
    active.lang = 'ja-JP';
    active.continuous = true;
    active.interimResults = true;
    active.maxAlternatives = 1;
    active.onstart = function () {
      if (recognizer !== active || disposed) return;
      showStatus('音声を入力中…', false, 'listening');
      render();
    };
    active.onresult = function (event) {
      if (recognizer !== active || disposed || !busy) return;
      for (var i = event.resultIndex || 0; i < event.results.length; i += 1) {
        recognitionText[i] = event.results[i][0] ? event.results[i][0].transcript : '';
      }
      recognitionText.length = event.results.length;
      var spoken = recognitionText.join('');
      var combined = initialText + (initialText && spoken ? '\n' : '') + spoken;
      transcript.value = combined.slice(0, maxLength);
      sendPreview();
      if (combined.length > maxLength) {
        currentError = '文字起こしが10,000文字に達しました。';
        requestStop(false);
      }
    };
    active.onerror = function (event) {
      if (recognizer !== active || disposed) return;
      var code = event && event.error;
      currentError = errorText(code);
      var known = window.VoiceChannel.STATUS_CODES.indexOf(code) !== -1 ? code : 'unknown-error';
      showStatus(currentError, true, known);
      // Browsers normally dispatch end after error. A missing end must not leave
      // a live capture or permanently disable a deliberate manual retry.
      clearTimer(errorTimer);
      errorTimer = window.setTimeout(function () {
        if (recognizer !== active || disposed) return;
        try { active.abort(); } catch (_) {}
        ended(active);
      }, 2000);
    };
    active.onend = function () { ended(active); };
    showStatus('音声入力を開始中…', false);
    render();
    try { active.start(); }
    catch (error) {
      var code = error && error.name === 'NotAllowedError' ? 'not-allowed' : 'unknown-error';
      currentError = errorText(code);
      try { active.abort(); } catch (_) {}
      ended(active);
      showStatus(currentError, true, code);
    }
  }

  startButton.addEventListener('click', start);
  stopButton.addEventListener('click', function () { requestStop(false); });
  returnButton.addEventListener('click', finalize);
  closeButton.addEventListener('click', function () { close(true); });
  transcript.addEventListener('input', function () {
    if (transcript.readOnly) return;
    render();
    if (transcript.value.length <= maxLength) sendPreview();
  });
  window.addEventListener('beforeunload', function () { dispose(!acknowledged); });

  try {
    var api = window.VoiceChannel;
    var configuration = api && api.parseFragment(window.location.hash);
    if (!configuration || window.top !== window.self || !window.opener || window.opener.closed) throw new Error('Missing form');
    maxLength = api.MAX_TEXT_LENGTH;
    channel = api.createChild({
      openerWindow: window.opener,
      nonce: configuration.channel,
      parentOrigin: configuration.parentOrigin,
      onAuthorize: function () {
        if (disposed || fatal) return;
        authorized = true;
        clearTimer(helloTimer);
        clearTimer(connectionTimer);
        showStatus('準備完了', false, 'waiting');
        render();
      },
      onStop: function () { requestStop(true); },
      onCancel: function () { close(false); },
      onAck: function () {
        if (disposed) return;
        acknowledged = true;
        waitingAck = false;
        clearTimer(ackTimer);
        showStatus('フォームへ戻しました。', false);
        render();
        close(false);
      }
    });
    window.addEventListener('message', function (event) { if (!disposed) channel.handleMessage(event); });
    function hello() {
      if (disposed || fatal || authorized) return;
      channel.hello();
      if (!authorized) helloTimer = window.setTimeout(hello, 400);
    }
    function watchOpener() {
      if (disposed) return;
      if (!window.opener || window.opener.closed) {
        dispose(false);
        showStatus('元のフォームが閉じられました。', true);
        return;
      }
      openerTimer = window.setTimeout(watchOpener, 1000);
    }
    connectionTimer = window.setTimeout(function () {
      if (authorized || disposed) return;
      fatal = true;
      clearTimer(helloTimer);
      showStatus('フォームに接続できませんでした。', true);
      render();
    }, 10000);
    hello();
    watchOpener();
  } catch (_) {
    fatal = true;
    showStatus('元のフォームに接続できませんでした。', true);
    render();
  }
})();
