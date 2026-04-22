// Multi-timer Kitchen Timer
// Any number of named timers can run concurrently. Each has its own
// state (idle / running / paused / done) and its own UI row.

(function () {
  'use strict';

  var timers = [];       // {id, name, total, remaining, state, tickHandle}
  var nextId = 1;

  function $(id) { return document.getElementById(id); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmt(total) {
    if (total < 0) total = 0;
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = Math.floor(total % 60);
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function parseTime() {
    var h = parseInt($('h-input').value, 10) || 0;
    var m = parseInt($('m-input').value, 10) || 0;
    var s = parseInt($('s-input').value, 10) || 0;
    return h * 3600 + m * 60 + s;
  }

  function setInputs(h, m, s) {
    $('h-input').value = pad(h);
    $('m-input').value = pad(m);
    $('s-input').value = pad(s);
    updatePreview();
  }

  function updatePreview() {
    var total = parseTime();
    $('preview').textContent = fmt(total);
  }

  function addTimer() {
    var total = parseTime();
    if (total <= 0) return;
    var name = ($('timer-name').value || '').trim() || 'Timer ' + nextId;

    var t = {
      id: nextId++,
      name: name,
      total: total,
      remaining: total,
      state: 'running',
      handle: null
    };
    timers.push(t);
    renderList();
    scheduleTick(t);

    $('timer-name').value = '';
    setInputs(0, 0, 0);
  }

  function scheduleTick(t) {
    if (t.handle) clearInterval(t.handle);
    t.handle = setInterval(function () {
      if (t.state !== 'running') return;
      t.remaining -= 1;
      if (t.remaining <= 0) {
        t.remaining = 0;
        t.state = 'done';
        clearInterval(t.handle);
        t.handle = null;
        playAlert();
        flashTitle(t.name);
      }
      renderList();
    }, 1000);
  }

  function playAlert() {
    try {
      var a = $('timerAudio');
      if (a) { a.currentTime = 0; a.play(); }
    } catch (e) {}
  }

  var origTitle = null;
  var titleFlashHandle = null;
  function flashTitle(name) {
    if (origTitle === null) origTitle = document.title;
    var on = true;
    if (titleFlashHandle) clearInterval(titleFlashHandle);
    titleFlashHandle = setInterval(function () {
      document.title = on ? '\u23F0 ' + name + ' done!' : origTitle;
      on = !on;
    }, 700);
  }

  function stopTitleFlash() {
    if (titleFlashHandle) { clearInterval(titleFlashHandle); titleFlashHandle = null; }
    if (origTitle !== null) document.title = origTitle;
  }

  function pauseResume(id) {
    var t = findTimer(id);
    if (!t || t.state === 'done') return;
    if (t.state === 'running') t.state = 'paused';
    else if (t.state === 'paused') t.state = 'running';
    renderList();
  }

  function resetOne(id) {
    var t = findTimer(id);
    if (!t) return;
    t.remaining = t.total;
    t.state = 'running';
    scheduleTick(t);
    renderList();
  }

  function removeOne(id) {
    var idx = -1;
    for (var i = 0; i < timers.length; i++) if (timers[i].id === id) { idx = i; break; }
    if (idx < 0) return;
    if (timers[idx].handle) clearInterval(timers[idx].handle);
    timers.splice(idx, 1);
    if (timers.every(function (t) { return t.state !== 'done'; })) stopTitleFlash();
    renderList();
  }

  function findTimer(id) {
    for (var i = 0; i < timers.length; i++) if (timers[i].id === id) return timers[i];
    return null;
  }

  function renderList() {
    var root = $('timer-list');
    if (!timers.length) {
      root.innerHTML = '<p class="timer-empty">No active timers. Set a time above and tap <strong>Start Timer</strong>.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < timers.length; i++) {
      var t = timers[i];
      var pct = t.total ? Math.max(0, Math.min(100, (t.remaining / t.total) * 100)) : 0;
      var stateLabel = t.state === 'done' ? 'DONE' : (t.state === 'paused' ? 'PAUSED' : 'RUNNING');
      var pauseLabel = t.state === 'running' ? 'Pause' : (t.state === 'paused' ? 'Resume' : '');
      html += '<div class="timer-row timer-' + t.state + '" data-id="' + t.id + '">' +
              '  <div class="timer-row-head">' +
              '    <span class="timer-row-name">' + escapeHtml(t.name) + '</span>' +
              '    <span class="timer-row-state">' + stateLabel + '</span>' +
              '  </div>' +
              '  <div class="timer-row-digits">' + fmt(t.remaining) + '</div>' +
              '  <div class="timer-row-bar"><div class="timer-row-fill" style="width:' + pct + '%;"></div></div>' +
              '  <div class="timer-row-btns">';
      if (t.state === 'done') {
        html += '    <button class="tool-btn tool-btn-sm tool-btn-warning" data-act="reset" data-id="' + t.id + '" type="button">Restart</button>';
      } else {
        html += '    <button class="tool-btn tool-btn-sm tool-btn-info" data-act="pause" data-id="' + t.id + '" type="button">' + pauseLabel + '</button>';
        html += '    <button class="tool-btn tool-btn-sm tool-btn-outline" data-act="reset" data-id="' + t.id + '" type="button">Reset</button>';
      }
      html += '    <button class="tool-btn tool-btn-sm tool-btn-danger" data-act="remove" data-id="' + t.id + '" type="button">Remove</button>' +
              '  </div>' +
              '</div>';
    }
    root.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function setPreset(h, m, s) { setInputs(h, m, s); }

  function adjust(field, delta) {
    var el = $(field);
    var v = parseInt(el.value, 10) || 0;
    var max = field === 'h-input' ? 23 : 59;
    v = Math.max(0, Math.min(max, v + delta));
    el.value = pad(v);
    updatePreview();
  }

  function stopAudio() {
    try {
      var a = $('timerAudio');
      if (a) { a.pause(); a.currentTime = 0; }
    } catch (e) {}
    stopTitleFlash();
  }

  function onClickList(e) {
    var btn = e.target;
    if (!btn.getAttribute) return;
    var act = btn.getAttribute('data-act');
    if (!act) return;
    var id = parseInt(btn.getAttribute('data-id'), 10);
    if (act === 'pause')  pauseResume(id);
    if (act === 'reset')  resetOne(id);
    if (act === 'remove') removeOne(id);
  }

  function onReady() {
    $('btn-add').addEventListener('click', addTimer);
    $('timer-list').addEventListener('click', onClickList);
    $('btn-stop-audio').addEventListener('click', stopAudio);

    var adjBtns = document.querySelectorAll('[data-adj]');
    for (var i = 0; i < adjBtns.length; i++) {
      (function (el) {
        var parts = el.getAttribute('data-adj').split(':');
        el.addEventListener('click', function () { adjust(parts[0], parseInt(parts[1], 10)); });
      }(adjBtns[i]));
    }

    var presets = document.querySelectorAll('[data-preset]');
    for (var j = 0; j < presets.length; j++) {
      (function (el) {
        var p = el.getAttribute('data-preset').split(':').map(function (x) { return parseInt(x, 10); });
        el.addEventListener('click', function () { setPreset(p[0], p[1], p[2]); });
      }(presets[j]));
    }

    ['h-input','m-input','s-input'].forEach(function (id) {
      $(id).addEventListener('input', updatePreview);
    });

    // Enter in the name field = add timer
    $('timer-name').addEventListener('keydown', function (e) {
      if (e.keyCode === 13 || e.key === 'Enter') { e.preventDefault(); addTimer(); }
    });

    renderList();
    updatePreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}());
