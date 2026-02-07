// Kitchen Timer - The Best of Brock Cookbook
// Modern rewrite - clean, no jQuery dependency

var timerInterval = null;
var totalSeconds = 0;
var isRunning = false;
var isPaused = false;

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function updateDisplay() {
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  var el = document.getElementById('timerDigits');
  el.innerHTML = pad(h) + ':' + pad(m) + ':' + pad(s);
}

function adjustTime(field, delta) {
  if (isRunning) return;
  var el = document.getElementById(field);
  var val = parseInt(el.value, 10) || 0;
  val += delta;
  var max = field === 'hours' ? 23 : 59;
  if (val < 0) val = 0;
  if (val > max) val = max;
  el.value = pad(val);
  syncInputsToDisplay();
}

function setPreset(h, m, s) {
  if (isRunning) return;
  document.getElementById('hours').value = pad(h);
  document.getElementById('min').value = pad(m);
  document.getElementById('sec').value = pad(s);
  syncInputsToDisplay();
}

function syncInputsToDisplay() {
  var h = parseInt(document.getElementById('hours').value, 10) || 0;
  var m = parseInt(document.getElementById('min').value, 10) || 0;
  var s = parseInt(document.getElementById('sec').value, 10) || 0;
  totalSeconds = h * 3600 + m * 60 + s;
  updateDisplay();
  // Remove alert state if present
  var digits = document.getElementById('timerDigits');
  digits.className = 'timer-digits';
  var alertCard = document.getElementById('alertCard');
  if (alertCard) alertCard.style.display = 'none';
}

function tick() {
  if (totalSeconds <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    isPaused = false;
    // Show completion
    var digits = document.getElementById('timerDigits');
    digits.innerHTML = "00:00:00";
    digits.className = 'timer-digits timer-alert';
    document.getElementById('btnStart').disabled = false;
    document.getElementById('btnPause').disabled = true;
    document.getElementById('btnStart').innerHTML = 'Start';
    // Show alert card
    var alertCard = document.getElementById('alertCard');
    if (alertCard) alertCard.style.display = 'block';
    // Play sound
    try {
      var audio = document.getElementById('timerAudio');
      if (audio) {
        audio.currentTime = 0;
        audio.play();
      }
    } catch(e) {}
    return;
  }
  totalSeconds--;
  updateDisplay();
}

function startTimer() {
  if (isRunning && !isPaused) return;

  if (isPaused) {
    // Resume
    isPaused = false;
    timerInterval = setInterval(tick, 1000);
    document.getElementById('btnStart').innerHTML = 'Start';
    document.getElementById('btnPause').disabled = false;
    document.getElementById('btnPause').innerHTML = 'Pause';
    return;
  }

  // Read values from inputs
  var h = parseInt(document.getElementById('hours').value, 10) || 0;
  var m = parseInt(document.getElementById('min').value, 10) || 0;
  var s = parseInt(document.getElementById('sec').value, 10) || 0;
  totalSeconds = h * 3600 + m * 60 + s;

  if (totalSeconds <= 0) return;

  isRunning = true;
  isPaused = false;

  // Clear alert state
  var digits = document.getElementById('timerDigits');
  digits.className = 'timer-digits';
  var alertCard = document.getElementById('alertCard');
  if (alertCard) alertCard.style.display = 'none';

  updateDisplay();
  timerInterval = setInterval(tick, 1000);

  document.getElementById('btnPause').disabled = false;
}

function pauseTimer() {
  if (!isRunning || isPaused) return;
  clearInterval(timerInterval);
  timerInterval = null;
  isPaused = true;
  document.getElementById('btnStart').innerHTML = 'Resume';
  document.getElementById('btnPause').innerHTML = 'Paused';
  document.getElementById('btnPause').disabled = true;
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  isRunning = false;
  isPaused = false;
  totalSeconds = 0;
  document.getElementById('hours').value = '00';
  document.getElementById('min').value = '00';
  document.getElementById('sec').value = '00';
  updateDisplay();
  var digits = document.getElementById('timerDigits');
  digits.className = 'timer-digits';
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnStart').innerHTML = 'Start';
  document.getElementById('btnPause').disabled = true;
  document.getElementById('btnPause').innerHTML = 'Pause';
  var alertCard = document.getElementById('alertCard');
  if (alertCard) alertCard.style.display = 'none';
  stopAlert();
}

function stopAlert() {
  try {
    var audio = document.getElementById('timerAudio');
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  } catch(e) {}
  var alertCard = document.getElementById('alertCard');
  if (alertCard) alertCard.style.display = 'none';
  var digits = document.getElementById('timerDigits');
  if (digits) digits.className = 'timer-digits';
}
