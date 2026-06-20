import { openActionDialog } from './components/controls.js';

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
 * Now a kit Modal-drawer action dialog (openActionDialog): Resume = Primary,
 * Start from beginning = Secondary. Back dismisses without invoking callbacks.
 * Returns a teardown function.
 */
function showResumeOrStartModal(options) {
  options = options || {};
  var viewOffset = parseInt(options.viewOffset, 10) || 0;
  var onResume = options.onResume;
  var onStartFromBeginning = options.onStartFromBeginning;
  var onCancel = options.onCancel;

  return openActionDialog({
    title: options.title ? String(options.title) : 'How would you like to play?',
    autoFocusId: 'resume',
    actions: [
      {
        id: 'resume',
        primary: true,
        label: 'Resume at ' + formatPlaybackTimestamp(viewOffset),
        onSelect: function () { if (onResume) onResume(); }
      },
      {
        id: 'start',
        label: 'Start from beginning',
        onSelect: function () { if (onStartFromBeginning) onStartFromBeginning(); }
      }
    ],
    onCancel: function () { if (onCancel) onCancel(); }
  });
}

export {
  formatPlaybackTimestamp,
  shouldOfferResumeChoice,
  showResumeOrStartModal
};
