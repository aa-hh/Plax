/**
 * Google TV component vocabulary (vanilla factories).
 *
 * One source of truth for buttons / chips / pill-tabs / list-items / modals so
 * every screen stops hand-rolling inline-styled controls. All factories emit
 * native <button> elements (matched by focus.js's focusableSelector) carrying
 * the gt-* classes styled in app.css. Built to docs/google-tv-foundation.md +
 * docs/google-tv-live-spec-supplement.md.
 *
 * webOS 4 / Chromium 53 safe: no template literals in hot paths beyond simple
 * concatenation, no modern DOM APIs, motion gated via html.caps-motion in CSS.
 */

import { focusFirst } from '../focus.js';

function el(tag, className) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Button. variant: 'filled' | 'outline' | 'icon' | 'wide' (default 'filled').
 * opts: { label, icon (SVG string), variant, onSelect, id, ariaLabel, disabled }
 */
function createButton(opts) {
  opts = opts || {};
  var variant = opts.variant || 'filled';
  var cls = 'btn';
  if (variant === 'filled') cls += ' btn-primary';
  else if (variant === 'outline') cls += ' btn-outline';
  else if (variant === 'icon') cls += ' btn-icon';
  else if (variant === 'wide') cls += ' btn-wide';
  if (opts.className) cls += ' ' + opts.className;

  var btn = el('button', cls);
  btn.type = 'button';
  btn.tabIndex = 0;
  if (opts.id) btn.id = opts.id;
  if (opts.disabled) btn.disabled = true;
  if (opts.ariaLabel) btn.setAttribute('aria-label', opts.ariaLabel);

  if (opts.icon) {
    var ic = el('span', 'btn-icon-glyph');
    ic.innerHTML = opts.icon;
    btn.appendChild(ic);
  }
  if (opts.label && variant !== 'icon') {
    var lbl = el('span', 'btn-label');
    lbl.textContent = opts.label;
    btn.appendChild(lbl);
  } else if (opts.label && variant === 'icon' && !opts.ariaLabel) {
    btn.setAttribute('aria-label', opts.label);
  }

  if (typeof opts.onSelect === 'function') {
    btn.addEventListener('click', opts.onSelect);
  }
  return btn;
}

/**
 * Chip (filter / setting toggle). opts: { label, active, onSelect, id, value }
 */
function createChip(opts) {
  opts = opts || {};
  var cls = 'gt-chip' + (opts.active ? ' gt-chip--active' : '');
  if (opts.className) cls += ' ' + opts.className;
  var chip = el('button', cls);
  chip.type = 'button';
  chip.tabIndex = 0;
  if (opts.id) chip.id = opts.id;
  if (opts.value != null) chip.setAttribute('data-value', String(opts.value));
  if (opts.active) chip.setAttribute('aria-current', 'true');
  chip.textContent = opts.label != null ? String(opts.label) : '';
  if (typeof opts.onSelect === 'function') chip.addEventListener('click', opts.onSelect);
  return chip;
}

/**
 * Horizontal pill tab bar (kit Tabs, tab item 17:849). Returns the host element
 * with a [data-focus-zone] so D-pad LEFT/RIGHT moves between tabs and DOWN drops
 * into content. opts: { tabs:[{id,label}], activeId, onSelect }
 * The returned node exposes setActive(id) to repaint the active (filled) pill.
 */
function createTabs(opts) {
  opts = opts || {};
  var tabs = opts.tabs || [];
  var host = el('div', 'gt-tabs');
  host.setAttribute('data-focus-zone', opts.zone || 'gt-tabs');
  host.setAttribute('role', 'tablist');
  var byId = {};

  tabs.forEach(function (t) {
    var active = t.id === opts.activeId;
    var tab = el('button', 'gt-tab' + (active ? ' gt-tab--active' : ''));
    tab.type = 'button';
    tab.tabIndex = 0;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('data-tab-id', String(t.id));
    if (active) tab.setAttribute('aria-selected', 'true');
    tab.textContent = t.label != null ? String(t.label) : String(t.id);
    tab.addEventListener('click', function () {
      host.setActive(t.id);
      if (typeof opts.onSelect === 'function') opts.onSelect(t.id, t);
    });
    byId[t.id] = tab;
    host.appendChild(tab);
  });

  host.setActive = function (id) {
    Object.keys(byId).forEach(function (k) {
      var on = k === String(id);
      byId[k].className = 'gt-tab' + (on ? ' gt-tab--active' : '');
      if (on) byId[k].setAttribute('aria-selected', 'true');
      else byId[k].removeAttribute('aria-selected');
    });
  };
  return host;
}

/**
 * List item (vertical option/setting lists). opts:
 * { label, sublabel, trailing (text|SVG), onSelect, id, selected }
 */
function createListItem(opts) {
  opts = opts || {};
  var cls = 'gt-list-item' + (opts.selected ? ' gt-list-item--selected' : '');
  if (opts.className) cls += ' ' + opts.className;
  var item = el('button', cls);
  item.type = 'button';
  item.tabIndex = 0;
  if (opts.id) item.id = opts.id;
  if (opts.selected) item.setAttribute('aria-current', 'true');

  var main = el('span', 'gt-list-item__main');
  var lbl = el('span', 'gt-list-item__label');
  lbl.textContent = opts.label != null ? String(opts.label) : '';
  main.appendChild(lbl);
  if (opts.sublabel) {
    var sub = el('span', 'gt-list-item__sublabel');
    sub.textContent = String(opts.sublabel);
    main.appendChild(sub);
  }
  item.appendChild(main);

  if (opts.trailing != null) {
    var tr = el('span', 'gt-list-item__trailing');
    if (/<svg/i.test(String(opts.trailing))) tr.innerHTML = String(opts.trailing);
    else tr.textContent = String(opts.trailing);
    item.appendChild(tr);
  }
  if (typeof opts.onSelect === 'function') item.addEventListener('click', opts.onSelect);
  return item;
}

var BACK_KEYS = { 461: 1, 27: 1, 8: 1 };
function isModalBack(e) {
  return BACK_KEYS[e.keyCode] === 1 || e.key === 'Backspace' || e.key === 'GoBack';
}

/**
 * Side-panel option picker (kit Modal drawer, Direction=Right — node 4498:31402).
 * The ONE overlay primitive for transient single-select option lists (subtitle /
 * quality / episode / confirm-as-list). Renders the kit side-panel anatomy:
 * surface-container floating panel on the right edge (scrim @60%, radius 16,
 * --space-5 padding, dark/3 shadow), a borderless List/Header title, then kit
 * List-Item rows (min-height 64, radius 8, padding 12/16, 24px radio `control`,
 * single-line label, light-fill :focus inversion, soft --active current state).
 *
 * This shares the exact row anatomy that the player track-selector sheet already
 * ships (`.player-menu-option`); the panel chrome lives under the `.gt-side-panel*`
 * namespace. Self-contained D-pad (UP/DOWN through rows + cancel, Back/Enter,
 * LEFT/RIGHT trapped). Lives in document.body so attachFocusNav never sees it.
 *
 * opts: { header (or title), rows (or options):[{id,label,detail,selected}],
 *         selectedId, onSelect (or onPick)(id,row), onCancel, footer:boolean,
 *         cancelLabel }
 * Returns a teardown function.
 */
function openSidePanel(opts) {
  opts = opts || {};
  var rows = opts.rows || opts.options || [];
  var onSelect = opts.onSelect || opts.onPick;
  var headerText = opts.header != null ? opts.header : opts.title;
  var showFooter = opts.footer !== false;
  var returnFocus = document.activeElement;

  var overlay = el('div', 'gt-side-panel');
  overlay.setAttribute('role', 'presentation');
  var sheet = el('div', 'gt-side-panel-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  if (headerText != null) {
    var header = el('div', 'gt-side-panel-header');
    var title = el('p', 'gt-side-panel-title');
    title.textContent = String(headerText);
    header.appendChild(title);
    sheet.appendChild(header);
  }

  var list = el('div', 'gt-side-panel-list');
  list.setAttribute('role', 'radiogroup');
  rows.forEach(function (o) {
    var selected = (opts.selectedId != null && o.id === opts.selectedId) || !!o.selected;
    var btn = el('button', 'player-menu-option gt-side-panel-option' +
      (selected ? ' player-menu-option--active' : ''));
    btn.type = 'button';
    btn.tabIndex = 0;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', selected ? 'true' : 'false');
    btn.setAttribute('data-option-id', String(o.id));

    var label = el('span', 'player-menu-option-label');
    label.textContent = o.label != null ? String(o.label) : String(o.id);
    btn.appendChild(label);

    // Trailing 24px radio control (kit List-Item `control`); dot filled on --active.
    var check = el('span', 'player-menu-option-check');
    btn.appendChild(check);

    btn.addEventListener('click', function () {
      teardown();
      if (typeof onSelect === 'function') onSelect(o.id, o);
    });
    list.appendChild(btn);
  });
  sheet.appendChild(list);

  var cancel = null;
  if (showFooter) {
    var footer = el('div', 'gt-side-panel-footer');
    cancel = el('button', 'btn btn-outline btn--sm');
    cancel.type = 'button';
    cancel.tabIndex = 0;
    cancel.textContent = opts.cancelLabel || 'Cancel';
    cancel.addEventListener('click', function () {
      teardown();
      if (typeof opts.onCancel === 'function') opts.onCancel();
    });
    footer.appendChild(cancel);
    sheet.appendChild(footer);
  }
  overlay.appendChild(sheet);

  function teardown() {
    document.removeEventListener('keydown', onKeyDown, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  function onKeyDown(e) {
    var key = e.keyCode;
    if (isModalBack(e)) {
      e.preventDefault();
      e.stopPropagation();
      teardown();
      if (typeof opts.onCancel === 'function') opts.onCancel();
      return;
    }
    if (key === 38 || key === 40) { // UP / DOWN
      e.preventDefault();
      e.stopPropagation();
      var btns = Array.prototype.slice.call(overlay.querySelectorAll('button'));
      var cur = btns.indexOf(document.activeElement);
      if (cur < 0) cur = 0;
      var next = cur + (key === 40 ? 1 : -1);
      if (next >= 0 && next < btns.length) btns[next].focus();
      return;
    }
    // Trap LEFT/RIGHT so focus can't escape into the background screen.
    if (key === 37 || key === 39) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown, true);
  var selectedEl = list.querySelector('.player-menu-option--active');
  if (selectedEl) selectedEl.focus();
  else focusFirst(sheet);

  return teardown;
}

/**
 * Action-dialog drawer (kit Modal drawer, Direction=Bottom — node 4498:31402).
 * Edge-anchored confirm/prompt: heading + optional description + a vertical
 * Actions column (Primary first, then Secondary). Self-contained D-pad (UP/DOWN
 * through actions, Back/Enter), lives in document.body. Generalises the bespoke
 * resume-choice + player autoplay prompts.
 *
 * opts: { title, message, actions:[{id,label,primary,onSelect}], onCancel,
 *         autoFocusId }
 * Returns a teardown function.
 */
function openActionDialog(opts) {
  opts = opts || {};
  var actions = opts.actions || [];
  var returnFocus = document.activeElement;

  var overlay = el('div', 'gt-dialog');
  overlay.setAttribute('role', 'presentation');
  var sheet = el('div', 'gt-dialog-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  var textCol = el('div', 'gt-dialog-text');
  if (opts.title) {
    var heading = el('p', 'gt-dialog-heading');
    heading.textContent = String(opts.title);
    textCol.appendChild(heading);
  }
  if (opts.message) {
    var desc = el('p', 'gt-dialog-desc');
    desc.textContent = String(opts.message);
    textCol.appendChild(desc);
  }
  sheet.appendChild(textCol);

  var actionsCol = el('div', 'gt-dialog-actions');
  var btns = [];
  actions.forEach(function (a) {
    // Primary = filled blue (.btn-primary); secondary = the kit surface-variant
    // fill (.btn) — both already kit-correct + focus-invert.
    var btn = el('button', 'btn' + (a.primary ? ' btn-primary' : ''));
    btn.type = 'button';
    btn.tabIndex = 0;
    if (a.id != null) btn.setAttribute('data-action-id', String(a.id));
    btn.textContent = a.label != null ? String(a.label) : String(a.id);
    btn.addEventListener('click', function () {
      teardown();
      if (typeof a.onSelect === 'function') a.onSelect(a.id, a);
    });
    actionsCol.appendChild(btn);
    btns.push(btn);
  });
  sheet.appendChild(actionsCol);
  overlay.appendChild(sheet);

  function teardown() {
    document.removeEventListener('keydown', onKeyDown, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  function onKeyDown(e) {
    var key = e.keyCode;
    if (isModalBack(e)) {
      e.preventDefault();
      e.stopPropagation();
      teardown();
      if (typeof opts.onCancel === 'function') opts.onCancel();
      return;
    }
    if (key === 38 || key === 40) { // UP / DOWN walk the actions
      e.preventDefault();
      e.stopPropagation();
      var cur = btns.indexOf(document.activeElement);
      if (cur < 0) cur = 0;
      var next = cur + (key === 40 ? 1 : -1);
      if (next >= 0 && next < btns.length) btns[next].focus();
      return;
    }
    if (key === 37 || key === 39) { // trap LEFT/RIGHT
      e.preventDefault();
      e.stopPropagation();
    }
  }

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown, true);
  var focusTarget = null;
  if (opts.autoFocusId != null) {
    focusTarget = actionsCol.querySelector('[data-action-id="' + opts.autoFocusId + '"]');
  }
  (focusTarget || btns[0] || sheet).focus();

  return teardown;
}

/**
 * Text-input modal. opts: { title, defaultValue, onConfirm, returnFocus }
 * Opens a modal with a native <input> (triggers webOS on-screen keyboard),
 * Confirm / Cancel buttons, and Back/Escape to close.
 */
function openTextInputModal(opts) {
  opts = opts || {};
  var returnFocus = opts.returnFocus || document.activeElement;

  var overlay = el('div', 'detail-modal gt-modal');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  var sheet = el('div', 'detail-modal-sheet gt-modal-sheet');

  // Label sits directly above the input (6px gap via flex), colour toggles blue on active.
  // No separate header bar — matches TV Design Kit text-field anatomy (nodes 3815:25032 / 3984:26492).
  // variant:'auth' → the larger Login/Auth field sizing (full-screen sign-in); base
  // (settings/watchlist) stays at the kit-scaled Text field size.
  var inputWrap = el('div', 'gt-text-input-wrap');
  if (opts.variant === 'auth') inputWrap.classList.add('gt-text-input-wrap--auth');
  if (opts.title) {
    var label = el('span', 'tv-text-input-label');
    label.textContent = String(opts.title);
    inputWrap.appendChild(label);
  }
  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'tv-text-input';
  input.autocomplete = 'off';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('spellcheck', 'false');
  input.tabIndex = 0;
  input.value = opts.defaultValue != null ? String(opts.defaultValue) : '';
  inputWrap.appendChild(input);
  sheet.appendChild(inputWrap);

  var footer = el('div', 'detail-modal-footer');
  var confirmBtn = el('button', 'btn btn-primary');
  confirmBtn.type = 'button';
  confirmBtn.tabIndex = 0;
  confirmBtn.textContent = opts.confirmLabel || 'Confirm';
  var cancelBtn = el('button', 'btn btn-outline btn--sm detail-modal-cancel');
  cancelBtn.type = 'button';
  cancelBtn.tabIndex = 0;
  cancelBtn.textContent = opts.cancelLabel || 'Cancel';
  footer.appendChild(confirmBtn);
  footer.appendChild(cancelBtn);
  sheet.appendChild(footer);
  overlay.appendChild(sheet);

  var focusables = [input, confirmBtn, cancelBtn];

  // inputMode: true while the webOS on-screen keyboard is showing / input is active.
  // The webOS keyboard steals DOM focus but still routes key events here. In that
  // state, keyCode 461 (webOS Back key) is the keyboard's Delete button and
  // arrow keys should move the cursor — not close the modal or cycle focusables.
  var inputMode = true;
  input.addEventListener('focus', function () {
    inputMode = true;
    inputWrap.classList.add('gt-text-input-wrap--active');
  });
  input.addEventListener('blur', function () {
    inputWrap.classList.remove('gt-text-input-wrap--active');
  });
  confirmBtn.addEventListener('focus', function () { inputMode = false; });
  cancelBtn.addEventListener('focus', function () { inputMode = false; });

  function deleteChar() {
    var s = input.selectionStart, end = input.selectionEnd, v = input.value;
    if (s !== end) {
      input.value = v.slice(0, s) + v.slice(end);
      input.setSelectionRange(s, s);
    } else if (s > 0) {
      input.value = v.slice(0, s - 1) + v.slice(s);
      input.setSelectionRange(s - 1, s - 1);
    }
  }

  function moveCursor(delta) {
    var pos = input.selectionStart + delta;
    pos = Math.max(0, Math.min(pos, input.value.length));
    input.setSelectionRange(pos, pos);
  }

  function close() {
    document.removeEventListener('keydown', onKeyDown, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
  }

  function confirm() {
    var val = input.value;
    close();
    if (typeof opts.onConfirm === 'function') opts.onConfirm(val);
  }

  function onKeyDown(e) {
    var code = e.keyCode || e.which;

    if (inputMode) {
      // webOS on-screen keyboard sends 461 (Back) for its Delete key.
      // Treat both 461 and 8 as "delete character" while keyboard is active.
      if (code === 461 || code === 8) {
        e.preventDefault(); e.stopPropagation();
        deleteChar(); return;
      }
      // Arrow keys move the cursor, not focus.
      if (code === 37) { e.preventDefault(); e.stopPropagation(); moveCursor(-1); return; }
      if (code === 39) { e.preventDefault(); e.stopPropagation(); moveCursor(1); return; }
      // Escape closes even in input mode.
      if (code === 27) { e.preventDefault(); e.stopPropagation(); close(); return; }
      // Up/Down move focus to the action buttons.
      if (code === 38 || code === 40) { e.preventDefault(); e.stopPropagation(); confirmBtn.focus(); return; }
    } else {
      // Buttons focused: Back/Escape/Backspace closes.
      if (code === 461 || code === 27 || code === 8) {
        e.preventDefault(); e.stopPropagation(); close(); return;
      }
      // Left/Up → prev; Right/Down → next.
      if (code === 37 || code === 38) {
        e.preventDefault(); e.stopPropagation();
        var idx = focusables.indexOf(document.activeElement);
        focusables[(idx - 1 + focusables.length) % focusables.length].focus(); return;
      }
      if (code === 39 || code === 40) {
        e.preventDefault(); e.stopPropagation();
        var idx2 = focusables.indexOf(document.activeElement);
        focusables[(idx2 + 1) % focusables.length].focus(); return;
      }
    }

    if (code === 13) { // Enter confirms from any element
      e.preventDefault(); e.stopPropagation();
      if (document.activeElement === cancelBtn) close();
      else confirm();
    }
  }

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown, true);
  setTimeout(function () { input.focus(); }, 0);

  return close;
}

export {
  createButton,
  createChip,
  createTabs,
  createListItem,
  openSidePanel,
  openActionDialog,
  openTextInputModal
};
