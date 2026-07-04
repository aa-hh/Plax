/**
 * Appearance editor pane — Role picker + Tone ramp + contrast note for one slot.
 *
 * Owns the RIGHT column of the Appearance screen. Given a slot key it renders:
 *   · the slot's human label
 *   · a Role picker (primary / secondary / tertiary / neutral) — real <button>s
 *   · a Tone ramp (one swatch per M3 tone) — each swatch's background read LIVE
 *     from `--palette-<role>-<tone>` via getComputedStyle
 *   · a contrast note derived from getOverrideContrast(slotKey)
 *
 * Changing Role or Tone persists via setOverride() then calls opts.onChange()
 * (the shell rebuilds the preview so the recolor shows). All buttons are real
 * <button> elements for the webOS D-pad focus engine. Vanilla ES modules,
 * Chrome53-safe. All getComputedStyle / getOverrideContrast access is guarded.
 */
import {
  getAppearancePrefs,
  setOverride,
  getOverrideContrast
} from '../../../settings/appearancePrefs.js';

// Human labels for the 5 customizable slots.
var SLOT_LABELS = {
  primaryButton: 'Primary button',
  selectedChip: 'Selected chip',
  switchOn: 'Switch (on)',
  progressFill: 'Progress / seek',
  focusAccent: 'Focus accent'
};

// Per-slot default role/tone (matches appearancePrefs slot defaults / contract).
var SLOT_DEFAULTS = {
  primaryButton: { role: 'primary', tone: 80 },
  switchOn: { role: 'primary', tone: 80 },
  progressFill: { role: 'primary', tone: 80 },
  focusAccent: { role: 'primary', tone: 80 },
  selectedChip: { role: 'secondary', tone: 40 }
};

var ROLES = ['primary', 'secondary', 'tertiary', 'neutral'];

var ROLE_LABELS = {
  primary: 'Primary',
  secondary: 'Secondary',
  tertiary: 'Tertiary',
  neutral: 'Neutral'
};

// M3 tonal ramp stops (mirrors appearancePrefs VALID_TONES order).
var TONES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100];

/** Resolve the current {role, tone} for a slot from prefs, else the slot default. */
function currentSelection(slotKey) {
  var def = SLOT_DEFAULTS[slotKey] || { role: 'primary', tone: 80 };
  var override = null;
  try {
    var prefs = getAppearancePrefs();
    override = prefs && prefs.overrides ? prefs.overrides[slotKey] : null;
  } catch (e) {
    override = null;
  }
  if (override && override.role && (override.tone || override.tone === 0)) {
    return { role: override.role, tone: override.tone };
  }
  return { role: def.role, tone: def.tone };
}

/** Read a live palette hex for a role/tone; '' when unavailable (guarded). */
function paletteHex(role, tone) {
  try {
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--palette-' + role + '-' + tone)
      .trim();
  } catch (e) {
    return '';
  }
}

function clear(container) {
  while (container.firstChild) container.removeChild(container.firstChild);
}

/**
 * Render the editor for one slot.
 * @param {HTMLElement} container - right-column host (cleared & rebuilt)
 * @param {string} slotKey - one of the 5 slot keys
 * @param {{onChange?:Function}} opts
 */
function renderEditor(container, slotKey, opts) {
  if (!container) return;
  var options = opts || {};
  clear(container);
  container.classList.remove('appearance-editor--empty');

  var label = SLOT_LABELS[slotKey] || slotKey;
  var sel = currentSelection(slotKey);

  // ── Title ────────────────────────────────────────────────────────────────
  var title = document.createElement('div');
  title.className = 'appearance-editor__title';
  title.textContent = label;
  container.appendChild(title);

  // ── Role picker ────────────────────────────────────────────────────────────
  var roleLabel = document.createElement('div');
  roleLabel.className = 'appearance-editor__heading';
  roleLabel.textContent = 'Role';
  container.appendChild(roleLabel);

  var roleRow = document.createElement('div');
  roleRow.className = 'appearance-role-row';

  ROLES.forEach(function (role) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'appearance-role';
    if (role === sel.role) btn.className += ' appearance-role--active';
    btn.setAttribute('data-role', role);
    btn.textContent = ROLE_LABELS[role] || role;
    btn.addEventListener('click', function () {
      apply(slotKey, role, sel.tone, container, options);
    });
    roleRow.appendChild(btn);
  });
  container.appendChild(roleRow);

  // ── Tone ramp ──────────────────────────────────────────────────────────────
  var toneLabel = document.createElement('div');
  toneLabel.className = 'appearance-editor__heading';
  toneLabel.textContent = 'Tone';
  container.appendChild(toneLabel);

  var ramp = document.createElement('div');
  ramp.className = 'appearance-tone-ramp';

  TONES.forEach(function (tone) {
    var sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'appearance-swatch';
    if (tone === sel.tone) sw.className += ' appearance-swatch--active';
    sw.setAttribute('data-tone', String(tone));
    sw.setAttribute('aria-label', 'Tone ' + tone);
    var hex = paletteHex(sel.role, tone);
    if (hex) sw.style.background = hex;
    sw.addEventListener('click', function () {
      apply(slotKey, sel.role, tone, container, options);
    });
    ramp.appendChild(sw);
  });
  container.appendChild(ramp);

  // ── Contrast note ──────────────────────────────────────────────────────────
  var note = buildContrastNote(slotKey);
  if (note) container.appendChild(note);
}

/** Persist the change, fire onChange, then re-render to reflect new state. */
function apply(slotKey, role, tone, container, options) {
  try {
    setOverride(slotKey, { role: role, tone: tone });
  } catch (e) {
    // setOverride is itself guarded; ignore.
  }
  if (typeof options.onChange === 'function') {
    try { options.onChange(); } catch (e) { /* shell-side */ }
  }
  // Re-render so role/tone active marks + swatch colors + contrast note refresh.
  renderEditor(container, slotKey, options);
}

/** Build the contrast warning element, or null when contrast passes / is unknown. */
function buildContrastNote(slotKey) {
  var result;
  try {
    result = getOverrideContrast(slotKey);
  } catch (e) {
    return null;
  }
  if (!result || !result.level) return null;

  if (result.level === 'large-only') {
    var warn = document.createElement('div');
    warn.className = 'appearance-warning';
    warn.textContent = 'OK for large text only';
    return warn;
  }
  if (result.level === 'fail') {
    var fail = document.createElement('div');
    fail.className = 'appearance-warning appearance-warning--fail';
    fail.textContent = 'Low contrast — may be hard to read';
    return fail;
  }
  return null; // 'pass' → no note
}

/** Empty-state hint shown before any element is selected in the preview. */
function renderEditorEmpty(container) {
  if (!container) return;
  clear(container);
  container.classList.add('appearance-editor--empty');
  var hint = document.createElement('div');
  hint.className = 'appearance-editor__hint';
  hint.textContent = 'Select an element in the preview to edit its colour and tone';
  container.appendChild(hint);
}

export { renderEditor, renderEditorEmpty };
