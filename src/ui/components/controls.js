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
 * Horizontal pill tab bar (replaces vertical left-rail filters). Returns the
 * host element with a [data-focus-zone] so D-pad LEFT/RIGHT moves between tabs
 * and DOWN drops into content. opts: { tabs:[{id,label}], activeId, onSelect }
 * The returned node exposes setActive(id) to repaint the active pill.
 */
function createTabs(opts) {
  opts = opts || {};
  var tabs = opts.tabs || [];
  // variant: 'pill' (default) | 'underline' (text tabs + sliding underline, e.g. seasons)
  var underline = opts.variant === 'underline';
  var host = el('div', 'gt-tabs' + (underline ? ' gt-tabs--underline' : ''));
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

  // Underline variant: a single indicator bar that slides (translateX, composited)
  // under the active tab. positionIndicator() must run once the host is in the DOM.
  var indicator = null;
  if (underline) {
    indicator = el('span', 'gt-tabs__indicator');
    host.appendChild(indicator);
  }
  function positionIndicator(id) {
    if (!indicator) return;
    var tab = byId[id == null ? opts.activeId : id];
    if (!tab || !tab.offsetParent) return; // not laid out yet
    indicator.style.width = tab.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
  }
  host.positionIndicator = positionIndicator;

  host.setActive = function (id) {
    Object.keys(byId).forEach(function (k) {
      var on = k === String(id);
      byId[k].className = 'gt-tab' + (on ? ' gt-tab--active' : '');
      if (on) byId[k].setAttribute('aria-selected', 'true');
      else byId[k].removeAttribute('aria-selected');
    });
    positionIndicator(id);
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
 * Vertical-list picker modal (generalizes resumeChoice / detail option modals).
 * Selected option shows a light pill + trailing checkmark. Self-contained D-pad
 * (UP/DOWN through options + cancel, Back/Enter). Lives in document.body so it
 * handles its own keys (attachFocusNav never sees it).
 *
 * opts: { title, options:[{id,label,detail,selected}], selectedId, onPick(id),
 *         onCancel, cancelLabel }
 * Returns a teardown function.
 */
function openModal(opts) {
  opts = opts || {};
  var options = opts.options || [];
  var returnFocus = document.activeElement;

  var overlay = el('div', 'detail-modal gt-modal');
  overlay.setAttribute('role', 'presentation');
  var sheet = el('div', 'detail-modal-sheet gt-modal-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  if (opts.title) {
    var title = el('p', 'detail-modal-title');
    title.textContent = String(opts.title);
    sheet.appendChild(title);
  }

  var list = el('div', 'detail-modal-list gt-modal-list');
  options.forEach(function (o) {
    var selected = (opts.selectedId != null && o.id === opts.selectedId) || !!o.selected;
    var btn = el('button', 'detail-modal-option gt-modal-option' +
      (selected ? ' detail-modal-option--active gt-modal-option--selected' : ''));
    btn.type = 'button';
    btn.tabIndex = 0;
    btn.setAttribute('data-option-id', String(o.id));

    var label = el('span', 'gt-modal-option__label');
    label.textContent = o.label != null ? String(o.label) : String(o.id);
    btn.appendChild(label);
    if (o.detail) {
      var det = el('span', 'gt-modal-option__detail');
      det.textContent = String(o.detail);
      btn.appendChild(det);
    }
    if (selected) {
      var check = el('span', 'gt-modal-option__check');
      check.textContent = '✓';
      btn.appendChild(check);
    }
    btn.addEventListener('click', function () {
      teardown();
      if (typeof opts.onPick === 'function') opts.onPick(o.id, o);
    });
    list.appendChild(btn);
  });
  sheet.appendChild(list);

  var footer = el('div', 'detail-modal-footer');
  var cancel = el('button', 'btn detail-modal-cancel');
  cancel.type = 'button';
  cancel.tabIndex = 0;
  cancel.textContent = opts.cancelLabel || 'Cancel';
  cancel.addEventListener('click', function () {
    teardown();
    if (typeof opts.onCancel === 'function') opts.onCancel();
  });
  footer.appendChild(cancel);
  sheet.appendChild(footer);
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
  var selectedEl = list.querySelector('.gt-modal-option--selected');
  if (selectedEl) selectedEl.focus();
  else focusFirst(sheet);

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
  var inputWrap = el('div', 'gt-text-input-wrap');
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
  var cancelBtn = el('button', 'btn btn-outline detail-modal-cancel');
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
  openModal,
  openTextInputModal
};
