/**
 * LG webOS TV media keys (Magic Remote + D-pad handled in focus.js).
 */
var KEYS = {
  PLAY: 415,
  PAUSE: 19,
  STOP: 413,
  FAST_FORWARD: 417,
  REWIND: 412,
  SKIP_NEXT: 418,
  BACK: 461,
  /** Channel Up — skip intro when offered during playback */
  SKIP_INTRO: 33,
  /** Yellow (data broadcast) on some LG remotes */
  YELLOW: 32,
  /** Magic Remote "Search" key — handled globally in router.js */
  SEARCH: 84,
  /** Info — toggle player controls on some LG remotes */
  INFO: 457,
  /** Green — alternate controls toggle */
  GREEN: 404,
  /** Red — open subtitle menu */
  RED: 403,
  /** Blue — toggle playback info overlay */
  BLUE: 406
};

var SEEK_STEP_SEC = 15;

function attachRemoteKeys(handlers) {
  handlers = handlers || {};

  function onKeyDown(e) {
    var code = e.keyCode;
    var handled = false;

    if (code === KEYS.PLAY) {
      if (handlers.onPlay) handlers.onPlay();
      handled = true;
    } else if (code === KEYS.PAUSE) {
      if (handlers.onPause) handlers.onPause();
      handled = true;
    } else if (code === KEYS.STOP) {
      if (handlers.onStop) handlers.onStop();
      handled = true;
    } else if (code === KEYS.FAST_FORWARD) {
      if (handlers.onFastForward) handlers.onFastForward();
      handled = true;
    } else if (code === KEYS.REWIND) {
      if (handlers.onRewind) handlers.onRewind();
      handled = true;
    } else if (code === KEYS.SKIP_NEXT) {
      if (handlers.onSkipNext) handlers.onSkipNext();
      handled = true;
    } else if (code === KEYS.SKIP_INTRO || code === KEYS.YELLOW) {
      if (handlers.onSkipIntro) handlers.onSkipIntro();
      handled = true;
    } else if (code === KEYS.INFO || code === KEYS.GREEN) {
      if (handlers.onToggleControls) handlers.onToggleControls();
      handled = true;
    } else if (code === KEYS.BLUE) {
      if (handlers.onToggleInfo) handlers.onToggleInfo();
      handled = true;
    } else if (code === KEYS.RED) {
      if (handlers.onOpenSubtitles) handlers.onOpenSubtitles();
      handled = true;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  document.addEventListener('keydown', onKeyDown, true);
  return function detach() {
    document.removeEventListener('keydown', onKeyDown, true);
  };
}

export { KEYS, SEEK_STEP_SEC, attachRemoteKeys };
