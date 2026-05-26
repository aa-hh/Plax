import { focusFirst } from './focus.js';

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** Wall-clock position for resume modal labels (matches player overlay). */
function formatPlaybackTimestamp(ms) {
  var s = Math.floor((parseInt(ms, 10) || 0) / 1000);
  var m = Math.floor(s / 60);
  var h = Math.floor(m / 60);
  s = s % 60;
  m = m % 60;
  if (h) return h + ':' + pad2(m) + ':' + pad2(s);
  return m + ':' + pad2(s);
}

function shouldOfferResumeChoice(viewOffset, duration) {
  var off = parseInt(viewOffset, 10);
  if (!off || off < 0) return false;
  var dur = parseInt(duration, 10);
  if (dur > 0 && off >= dur - 5000) return false;
  return true;
}

/**
 * TV modal: resume at saved position or start from beginning.
 * Back dismisses without invoking callbacks. Returns a teardown function.
 */
function showResumeOrStartModal(options) {
  options = options || {};
  var viewOffset = parseInt(options.viewOffset, 10) || 0;
  var onResume = options.onResume;
  var onStartFromBeginning = options.onStartFromBeginning;
  var onCancel = options.onCancel;
  var returnFocus = document.activeElement;

  var overlay = document.createElement('div');
  overlay.className = 'detail-modal resume-choice-modal';
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML =
    '<div class="detail-modal-sheet resume-choice-sheet" role="dialog" aria-modal="true">' +
    '<p class="detail-modal-title" id="resume-choice-title"></p>' +
    '<div class="detail-modal-list resume-choice-list" id="resume-choice-list"></div>' +
    '<div class="detail-modal-footer">' +
    '<button type="button" class="btn detail-modal-cancel" id="resume-choice-cancel" tabindex="0">Cancel</button>' +
    '</div></div>';

  var titleEl = overlay.querySelector('#resume-choice-title');
  var listEl = overlay.querySelector('#resume-choice-list');
  var cancelBtn = overlay.querySelector('#resume-choice-cancel');
  if (titleEl) {
    titleEl.textContent = options.title ? String(options.title) : 'How would you like to play?';
  }

  var resumeLabel = 'Resume playback at ' + formatPlaybackTimestamp(viewOffset);
  var choices = [
    { id: 'resume', label: resumeLabel, primary: true },
    { id: 'start', label: 'Start from beginning', primary: false }
  ];

  choices.forEach(function (choice) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn detail-modal-option' +
      (choice.primary ? ' detail-modal-option--active' : '');
    btn.textContent = choice.label;
    btn.tabIndex = 0;
    btn.addEventListener('click', function () {
      teardown();
      if (choice.id === 'resume' && onResume) onResume();
      if (choice.id === 'start' && onStartFromBeginning) onStartFromBeginning();
    });
    listEl.appendChild(btn);
  });

  function teardown() {
    document.removeEventListener('keydown', onKeyDown, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  function onKeyDown(e) {
    if (e.keyCode === 461 || e.key === 'Backspace' || e.key === 'GoBack' ||
        e.keyCode === 27 || e.keyCode === 8) {
      e.preventDefault();
      e.stopPropagation();
      teardown();
      if (onCancel) onCancel();
    }
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      teardown();
      if (onCancel) onCancel();
    });
  }

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown, true);
  var primaryBtn = listEl.querySelector('.detail-modal-option--active');
  if (primaryBtn) primaryBtn.focus();
  else focusFirst(overlay.querySelector('.resume-choice-sheet') || overlay);

  return teardown;
}

export {
  formatPlaybackTimestamp,
  shouldOfferResumeChoice,
  showResumeOrStartModal
};
