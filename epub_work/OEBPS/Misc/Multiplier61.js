// Recipe Multiplier page controller.
// Delegates ingredient-by-ingredient math to Scaler.js (BrockScaler).

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // Preload from URL params (?from=5&recipe=Braised+Short+Ribs&ingredients=...).
  function getParam(name) {
    var q = (window.location.search || '').replace(/^\?/, '');
    if (!q) return null;
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      if (decodeURIComponent(kv[0]) === name) {
        return decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      }
    }
    return null;
  }

  function showRatio(show, ratio) {
    var el = $('ratioDisplay');
    if (!el) return;
    if (show && ratio) {
      el.style.display = 'block';
      $('ratioValue').innerHTML = (Math.round(ratio * 100) / 100).toFixed(2) + 'x';
    } else {
      el.style.display = 'none';
    }
  }

  function computeRatio() {
    var oldS = parseFloat($('old').value);
    var newS = parseFloat($('new').value);
    if (isNaN(oldS) || isNaN(newS) || oldS <= 0 || newS <= 0) return NaN;
    return newS / oldS;
  }

  function Calculate() {
    var ratio = computeRatio();
    if (isNaN(ratio)) { showRatio(false); return; }
    showRatio(true, ratio);

    var text = $('area').value;
    if (!text.trim()) { $('results').value = ''; return; }

    if (!window.BrockScaler) {
      $('results').value = '(Scaler not loaded — check Misc/Scaler.js)';
      return;
    }
    $('results').value = window.BrockScaler.scaleRecipe(text, ratio);
  }

  function clearAll() {
    $('old').value = '';
    $('new').value = '';
    $('area').value = '';
    $('results').value = '';
    showRatio(false);
  }

  function copyResults() {
    var ta = $('results');
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    var btn = $('copyBtn');
    if (btn) {
      var prev = btn.innerHTML;
      btn.innerHTML = 'Copied!';
      setTimeout(function () { btn.innerHTML = prev; }, 1200);
    }
  }

  function setQuick(oldS, newS) {
    $('old').value = oldS;
    $('new').value = newS;
    Calculate();
  }

  function onReady() {
    var fromYield = getParam('from');
    var toYield   = getParam('to');
    var ingText   = getParam('ingredients');
    var title     = getParam('recipe');

    if (fromYield) $('old').value = fromYield;
    if (toYield)   $('new').value = toYield;
    if (ingText)   $('area').value = ingText;
    if (title) {
      var h = document.querySelector('.tool-header h1');
      if (h) h.innerHTML = 'Scale: ' + title;
    }

    // Wire explicit onclick handlers (avoid inline handler order issues).
    $('btnScale').addEventListener('click', Calculate);
    $('btnClear').addEventListener('click', clearAll);
    if ($('copyBtn')) $('copyBtn').addEventListener('click', copyResults);

    var quick = document.querySelectorAll('[data-quick]');
    for (var i = 0; i < quick.length; i++) {
      (function (el) {
        var parts = el.getAttribute('data-quick').split(':');
        el.addEventListener('click', function () { setQuick(parts[0], parts[1]); });
      }(quick[i]));
    }

    // Live re-scale on servings change when both are filled.
    $('old').addEventListener('input', function () { if ($('new').value) Calculate(); });
    $('new').addEventListener('input', function () { if ($('old').value) Calculate(); });

    if (fromYield && toYield && ingText) Calculate();
  }

  // Expose for legacy inline handlers still referenced elsewhere.
  window.Calculate = Calculate;
  window.clearAll = clearAll;
  window.Check = Calculate;
  window.Preview = function () {};

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}());
