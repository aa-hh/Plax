/**
 * Focus debug overlay — activated via ?focusDebug=1 or by pressing the Blue
 * remote key (406) at runtime.
 *
 * When active it draws a fixed SVG overlay showing:
 *   • A bright ring around the currently focused element
 *   • Coloured arrows for each direction that has a spatial nav target
 *   • A grey X for directions with no target (dead ends)
 *   • A dim ring around each directional target
 *   • A label strip showing the focused element's id/class
 *
 * This is a dev-only diagnostic. Never import it from production code paths;
 * wire it in app.js behind isFocusDebugEnabled().
 */

import { spatialMove, getScoredCandidates } from './focus.js';

var KEY_BLUE = 406;
var KEY_F2   = 113; // simulator keyboard shortcut for focus debug toggle

var DIRS = [
  { key: 38, label: '↑', axis: 'up'    },
  { key: 40, label: '↓', axis: 'down'  },
  { key: 37, label: '←', axis: 'left'  },
  { key: 39, label: '→', axis: 'right' },
];

var COLOR_FOCUS   = '#A8C7FA'; // accent blue
var COLOR_TARGET  = 'rgba(168,199,250,0.35)';
var COLOR_ARROW   = '#A8C7FA';
var COLOR_DEAD    = 'rgba(255,255,255,0.18)';
var COLOR_LABEL   = '#131314';

var _enabled = false;
var _overlay = null;
var _svg = null;
var _label = null;
var _container = null;

export function isFocusDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return !!(window.location && window.location.search &&
            window.location.search.indexOf('focusDebug=1') >= 0);
}

function svgEl(tag, attrs) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (var k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function createOverlay() {
  var wrap = document.createElement('div');
  wrap.id = 'focus-debug-overlay';
  wrap.style.cssText = [
    'position:fixed',
    'top:0', 'left:0', 'right:0', 'bottom:0', /* chrome53-ok */
    'pointer-events:none',
    'z-index:99999',
    'overflow:hidden',
  ].join(';');

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
  wrap.appendChild(svg);

  var label = document.createElement('div');
  label.style.cssText = [
    'position:absolute',
    'bottom:40px',
    'left:50%',
    'transform:translateX(-50%)',
    'background:rgba(168,199,250,0.92)',
    'color:#131314',
    'font:bold 20px/1 monospace',
    'padding:6px 16px',
    'border-radius:6px',
    'max-width:80%',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'white-space:nowrap',
    'pointer-events:none',
  ].join(';');
  wrap.appendChild(label);

  document.body.appendChild(wrap);
  _overlay = wrap;
  _svg = svg;
  _label = label;
}

function clearSvg() {
  while (_svg.firstChild) _svg.removeChild(_svg.firstChild);
}

function rectStr(r) {
  return r.left + ' ' + r.top + ' ' + r.width + ' ' + r.height;
}

function drawRect(r, color, strokeWidth) {
  _svg.appendChild(svgEl('rect', {
    x: r.left, y: r.top, width: r.width, height: r.height,
    fill: 'none',
    stroke: color,
    'stroke-width': strokeWidth || 3,
    rx: 4,
  }));
}

// Arrow from centre of `from` rect toward centre of `to` rect, stopping at
// the edge of `to`. Drawn as a line + arrowhead polygon + score badge.
function drawArrow(from, to, color, score) {
  var fx = from.left + from.width / 2;
  var fy = from.top  + from.height / 2;
  var tx = to.left   + to.width  / 2;
  var ty = to.top    + to.height / 2;

  var dx = tx - fx, dy = ty - fy;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  var ux = dx / len, uy = dy / len;
  var margin = 6;
  var ex = tx - ux * margin;
  var ey = ty - uy * margin;

  _svg.appendChild(svgEl('line', {
    x1: fx, y1: fy, x2: ex, y2: ey,
    stroke: color, 'stroke-width': 3, 'stroke-dasharray': '8 4', opacity: 0.85
  }));

  // Arrowhead
  var hw = 10, hl = 16;
  var px = -uy * hw, py = ux * hw;
  var points =
    (ex + ux * hl) + ',' + (ey + uy * hl) + ' ' +
    (ex + px)       + ',' + (ey + py)       + ' ' +
    (ex - px)       + ',' + (ey - py);
  _svg.appendChild(svgEl('polygon', { points: points, fill: color, opacity: 0.9 }));

  // Score badge at the midpoint of the line.
  if (score != null) {
    var mx = (fx + ex) / 2;
    var my = (fy + ey) / 2;
    _svg.appendChild(svgEl('rect', {
      x: mx - 22, y: my - 11, width: 44, height: 22,
      rx: 6, fill: 'rgba(19,19,20,0.82)'
    }));
    var txt = svgEl('text', {
      x: mx, y: my + 5,
      'text-anchor': 'middle',
      fill: color,
      'font-size': '13',
      'font-family': 'monospace',
      'font-weight': 'bold'
    });
    txt.textContent = String(score);
    _svg.appendChild(txt);
  }
}

// Dead-end indicator: small X badge at edge of focused element in the given direction.
function drawDeadEnd(rect, dir) {
  var cx, cy;
  if (dir === 38) { cx = rect.left + rect.width / 2; cy = rect.top - 18; }
  else if (dir === 40) { cx = rect.left + rect.width / 2; cy = rect.bottom + 18; }
  else if (dir === 37) { cx = rect.left - 18; cy = rect.top + rect.height / 2; }
  else                 { cx = rect.right + 18; cy = rect.top + rect.height / 2; }
  var s = 7;
  _svg.appendChild(svgEl('line', { x1: cx-s, y1: cy-s, x2: cx+s, y2: cy+s, stroke: COLOR_DEAD, 'stroke-width': 2.5 }));
  _svg.appendChild(svgEl('line', { x1: cx+s, y1: cy-s, x2: cx-s, y2: cy+s, stroke: COLOR_DEAD, 'stroke-width': 2.5 }));
}

function elementLabel(el) {
  if (!el) return '';
  var parts = [];
  if (el.id) parts.push('#' + el.id);
  var cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean);
  if (cls.length) parts.push('.' + cls.slice(0, 3).join('.'));
  var txt = (el.textContent || '').trim().slice(0, 30);
  if (txt) parts.push('"' + txt + '"');
  return parts.join(' ') || el.tagName.toLowerCase();
}

var _redrawScheduled = false;

function redraw() {
  _redrawScheduled = false;
  if (!_enabled || !_overlay || !_svg) return;
  clearSvg();

  var active = document.activeElement;
  if (!active || active === document.body) {
    _label.textContent = '(no focus)';
    return;
  }

  var aRect = active.getBoundingClientRect();
  if (!aRect || (aRect.width === 0 && aRect.height === 0)) return;

  // Focused element ring
  drawRect(aRect, COLOR_FOCUS, 3);

  // Directional arrows with scores
  for (var i = 0; i < DIRS.length; i++) {
    var d = DIRS[i];
    var scored = getScoredCandidates(_container, d.key);
    if (scored.length > 0) {
      var winner = scored[0];
      drawRect(winner.rect, COLOR_TARGET, 2);
      drawArrow(aRect, winner.rect, COLOR_ARROW, winner.score);
      // Show dimmer arrows + scores for runner-up candidates (up to 2 more).
      for (var j = 1; j < Math.min(scored.length, 3); j++) {
        drawRect(scored[j].rect, 'rgba(168,199,250,0.18)', 1);
        drawArrow(aRect, scored[j].rect, 'rgba(168,199,250,0.45)', scored[j].score);
      }
    } else {
      drawDeadEnd(aRect, d.key);
    }
  }

  _label.textContent = elementLabel(active);
}

function enable(container) {
  _enabled = true;
  _container = container;
  if (!_overlay) createOverlay();
  _overlay.style.display = '';
  redraw();
}

function disable() {
  _enabled = false;
  if (_overlay) _overlay.style.display = 'none';
}

function toggle(container) {
  if (_enabled) disable(); else enable(container);
}

export function initFocusDebug(container) {
  var active = isFocusDebugEnabled();

  // Blue remote key (TV) or F2 (simulator keyboard) toggles overlay
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === KEY_BLUE || e.keyCode === KEY_F2) { toggle(container); e.preventDefault(); }
  }, true);

  document.addEventListener('focusin', function () {
    if (_enabled) redraw();
  }, true);

  // Redraw after DOM mutations that aren't from the overlay itself.
  // Filtering self-mutations prevents the infinite loop: clearSvg() + appendChild
  // would otherwise trigger the observer, scheduling another redraw immediately.
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function (mutations) {
      if (!_enabled) return;
      for (var i = 0; i < mutations.length; i++) {
        var t = mutations[i].target;
        if (_overlay && (t === _overlay || (_overlay.contains && _overlay.contains(t)))) continue;
        // Schedule at most one rAF redraw per mutation batch.
        if (!_redrawScheduled) {
          _redrawScheduled = true;
          requestAnimationFrame(redraw);
        }
        return;
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (active) enable(container);
}
