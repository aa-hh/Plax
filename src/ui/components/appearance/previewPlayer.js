// Appearance preview: a compact, recognizable mock of the PLAYER overlay.
// Built from the real player component classes (see playerScreen.js) plus
// `.appearance-chrome` decorative bits. Selectable targets are real <button>s
// the shell event-delegates on via [data-slot]; NO click handlers here.
//
// Slots included (per the shared contract — Player list):
//   progressFill  -> the seek bar's played fill (.player-seek-played)
//   primaryButton -> the Skip Intro pill (.player-skip-intro-prompt)
//   focusAccent   -> a transport control pill (.player-control-pill)
//
// Chrome53 / webOS4 safe: no color-mix, no :focus-within, transform/opacity only.

var ICON_REWIND =
  '<svg class="player-control-icon" viewBox="0 0 17.5 12" aria-hidden="true">' +
  '<path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" d="M0 6L8.5 0V12L0 6ZM17.5 0L9 6L17.5 12V0ZM3.47 6L6.5 8.14V3.86L3.47 6ZM12.47 6L15.5 8.14V3.86L12.47 6Z"/>' +
  '</svg>';
var ICON_PLAY =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M8 5v14l11-7L8 5z"/>' +
  '</svg>';
var ICON_FORWARD =
  '<svg class="player-control-icon" viewBox="0 0 17.5 12" aria-hidden="true">' +
  '<path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" d="M8.5 6L0 12V0L8.5 6ZM9 12L17.5 6L9 0V12ZM5.03 6L2 3.86V8.14L5.03 6ZM14.03 6L11 3.86V8.14L14.03 6Z"/>' +
  '</svg>';
var ICON_SKIP_INTRO =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M4 18l8.5-6L4 6v12zm9-6v6h2V6h-2zm3.5 6 5.5-3-5.5-3v6z"/>' +
  '</svg>';

function el(tag, className, html) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

function target(slot, label, sampleHtml) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'appearance-target';
  btn.tabIndex = 0;
  btn.setAttribute('data-slot', slot);
  var sample = el('span', 'appearance-target__sample', sampleHtml);
  var lbl = el('span', 'appearance-target__label', label);
  btn.appendChild(sample);
  btn.appendChild(lbl);
  return btn;
}

export function buildPlayerPreview() {
  var root = el('div', 'appearance-mock appearance-mock--player');

  // Dark, video-ish backdrop standing in for the playing frame.
  var backdrop = el('div', 'appearance-chrome appearance-mock-player__backdrop');
  root.appendChild(backdrop);

  // The bottom overlay column — real player chrome lives here.
  var bottom = el('div', 'player-overlay appearance-mock-player__overlay');

  // Meta header: title + secondary line (decorative chrome).
  var header = el('div', 'player-meta-header');
  var info = el('div', 'player-meta-header__info');
  info.appendChild(el('h1', 'player-now-playing-title', 'The Sample Episode'));
  info.appendChild(el('p', 'player-now-playing-subtitle', 'S1 · E3 · A Recognizable Title'));
  header.appendChild(info);
  bottom.appendChild(header);

  // Skip-intro pill = primaryButton target. Render the real pill class inside.
  var skipPill =
    '<span class="player-skip-intro-prompt appearance-mock-player__skip">' +
    ICON_SKIP_INTRO +
    '<span class="player-skip-intro-prompt-text">Skip Intro</span>' +
    '<span class="player-skip-intro-prompt-hint">OK</span>' +
    '</span>';
  bottom.appendChild(target('primaryButton', 'Skip-intro pill', skipPill));

  // Seek row: elapsed time, seek bar (progressFill target), total time.
  var seekRow = el('div', 'player-seek-row appearance-mock-player__seek-row');
  seekRow.appendChild(el('span', 'player-time player-time--elapsed', '12:30'));

  var seekTarget = target(
    'progressFill',
    'Seek bar',
    '<span class="player-seek-bar appearance-mock-player__seek">' +
      '<span class="player-seek-track">' +
        '<span class="player-seek-played"></span>' +
        '<span class="player-seek-thumb"></span>' +
      '</span>' +
    '</span>'
  );
  seekTarget.classList.add('appearance-target--wide');
  seekRow.appendChild(seekTarget);

  seekRow.appendChild(el('span', 'player-time player-time--total', '48:00'));
  bottom.appendChild(seekRow);

  // Transport cluster, centered. The middle (play) pill is the focusAccent target;
  // the flanking pills are decorative chrome to read as a transport row.
  var controls = el('div', 'player-controls-row appearance-mock-player__controls');
  var transport = el('div', 'player-transport');

  transport.appendChild(el(
    'span',
    'player-control-pill player-control-pill--icon appearance-chrome',
    ICON_REWIND
  ));

  var transportTarget = target(
    'focusAccent',
    'Transport control',
    '<span class="player-control-pill player-control-pill--icon player-control-pill--play">' +
      ICON_PLAY +
    '</span>'
  );
  transport.appendChild(transportTarget);

  transport.appendChild(el(
    'span',
    'player-control-pill player-control-pill--icon appearance-chrome',
    ICON_FORWARD
  ));

  controls.appendChild(transport);
  bottom.appendChild(controls);

  root.appendChild(bottom);
  return root;
}
