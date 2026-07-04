/**
 * Appearance preferences — theme selection + 5 curated color-slot overrides.
 *
 * Persists under storage key 'appearancePrefs' (localStorage `plax_appearancePrefs`)
 * and mirrors into store state `appearancePrefs`. Applying a theme sets `data-theme`
 * on the document element; slot overrides resolve a tonal-ramp hex from CSS and write
 * indirection `--role-*` vars inline so CSS picks them up (with fallbacks when cleared).
 *
 * Mirrors the module shape of playbackSettings.js. Vanilla ES modules, Chrome53-safe
 * (babel-transpiled). All localStorage/DOM access is wrapped in try/catch for webOS.
 */
import { getState, setState } from '../core/store.js';
import { get as storageGet, set as storageSet } from '../core/storage.js';

var STORAGE_KEY = 'appearancePrefs';

var DEFAULT_PREFS = { theme: 'default', contrast: 'standard', overrides: {} };

var VALID_THEMES = { default: true, cyan: true, gold: true, teal: true };

var VALID_CONTRAST = { standard: true, medium: true, high: true };

/**
 * The 5 curated customizable slots → indirection CSS vars set on documentElement.
 * `fill` is always present; `on` only where a readable foreground color is needed.
 */
var SLOT_VARS = {
  primaryButton: { fill: '--role-primaryBtn-fill', on: '--role-primaryBtn-on' },
  selectedChip: { fill: '--role-selChip-fill', on: '--role-selChip-on' },
  switchOn: { fill: '--role-switch-fill' },
  progressFill: { fill: '--role-progress-fill' },
  focusAccent: { fill: '--role-accent' }
};

/** Nominal role/tone each slot resolves to when it has no explicit override.
 * Used so contrast can be evaluated against the slot's *current* color even
 * before the user changes anything (the --role-* var is cleared when unset). */
var SLOT_DEFAULTS = {
  primaryButton: { role: 'primary', tone: 80 },
  selectedChip: { role: 'secondary', tone: 40 },
  switchOn: { role: 'primary', tone: 80 },
  progressFill: { role: 'primary', tone: 80 },
  focusAccent: { role: 'primary', tone: 80 }
};

var VALID_ROLES = {
  primary: true,
  secondary: true,
  tertiary: true,
  neutral: true,
  'neutral-variant': true
};

var VALID_TONES = (function () {
  var tones = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100];
  var map = {};
  tones.forEach(function (t) { map[t] = true; });
  return map;
})();

// ── Color helpers ──────────────────────────────────────────────────────────

/** Parse `#rgb`/`#rrggbb` (tolerant of whitespace / missing `#`) → {r,g,b} or null. */
function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  var h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

/** WCAG relative luminance (0..1) from {r,g,b} (0..255). */
function relativeLuminance(rgb) {
  function lin(c) {
    var s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** Pick a readable foreground over `hex`: near-black on light fills, white otherwise. */
function readableOn(hex) {
  var rgb = parseHex(hex);
  if (!rgb) return '#FFFFFF';
  return relativeLuminance(rgb) > 0.45 ? '#0A0A0A' : '#FFFFFF';
}

/**
 * M3 dark tone-pairing for an `on`-color: for a fill at tone T, the readable
 * foreground comes from the SAME role's ramp at onTone = (T>=60 ? 20 : T<=40 ? 90 : null).
 * Mid-tones (45–55) are the danger zone → null → caller falls back to readableOn.
 * @returns hex string from `--palette-<role>-<onTone>`, or null to signal fallback.
 */
function m3OnColor(computed, role, tone) {
  var t = Number(tone);
  if (!isFinite(t)) return null;
  var onTone = t >= 60 ? 20 : (t <= 40 ? 90 : null);
  if (onTone === null) return null;
  try {
    var hex = computed.getPropertyValue('--palette-' + role + '-' + onTone).trim();
    return hex || null;
  } catch (e) {
    return null;
  }
}

/** WCAG contrast ratio between two hex colors; null if either is unparseable. */
function contrastRatio(fillHex, onHex) {
  var f = parseHex(fillHex);
  var o = parseHex(onHex);
  if (!f || !o) return null;
  var lf = relativeLuminance(f);
  var lo = relativeLuminance(o);
  var hi = Math.max(lf, lo);
  var lo2 = Math.min(lf, lo);
  return (hi + 0.05) / (lo2 + 0.05);
}

function validOverride(o) {
  return !!o && VALID_ROLES[o.role] === true && VALID_TONES[o.tone] === true;
}

// ── Prefs read / persist ───────────────────────────────────────────────────

/** Sanitize arbitrary stored/partial prefs into the canonical shape. */
function normalizePrefs(raw) {
  var src = raw && typeof raw === 'object' ? raw : {};
  var theme = VALID_THEMES[src.theme] ? src.theme : 'default';
  var contrast = VALID_CONTRAST[src.contrast] ? src.contrast : 'standard';
  var overrides = {};
  var srcOverrides = src.overrides && typeof src.overrides === 'object' ? src.overrides : {};
  Object.keys(SLOT_VARS).forEach(function (slotKey) {
    var o = srcOverrides[slotKey];
    if (validOverride(o)) overrides[slotKey] = { role: o.role, tone: o.tone };
  });
  return { theme: theme, contrast: contrast, overrides: overrides };
}

/** Merged defaults + stored prefs (always a fresh copy; never an internal ref). */
function getAppearancePrefs() {
  return normalizePrefs(getState().appearancePrefs || DEFAULT_PREFS);
}

function persist(prefs) {
  setState({ appearancePrefs: prefs });
  storageSet(STORAGE_KEY, prefs);
}

// ── Mutators (persist + apply) ─────────────────────────────────────────────

function setTheme(themeKey) {
  var prefs = getAppearancePrefs();
  prefs.theme = VALID_THEMES[themeKey] ? themeKey : 'default';
  persist(prefs);
  applyAppearance(prefs);
  return prefs;
}

function setContrast(level) {
  var prefs = getAppearancePrefs();
  prefs.contrast = VALID_CONTRAST[level] ? level : 'standard';
  persist(prefs);
  applyAppearance(prefs);
  return prefs;
}

function setOverride(slotKey, override) {
  if (!SLOT_VARS[slotKey] || !validOverride(override)) return getAppearancePrefs();
  var prefs = getAppearancePrefs();
  prefs.overrides[slotKey] = { role: override.role, tone: override.tone };
  persist(prefs);
  applyAppearance(prefs);
  return prefs;
}

function clearOverride(slotKey) {
  var prefs = getAppearancePrefs();
  delete prefs.overrides[slotKey];
  persist(prefs);
  applyAppearance(prefs);
  return prefs;
}

/** User-facing "Reset to default" — fully restores the original look. */
function resetAppearance() {
  var prefs = { theme: 'default', contrast: 'standard', overrides: {} };
  persist(prefs);
  applyAppearance(prefs);
  return prefs;
}

// ── Apply to DOM ───────────────────────────────────────────────────────────

/**
 * Apply prefs to documentElement. Ordering is load-bearing:
 *   1. set/remove data-theme FIRST (so the active palette ramp is in effect)
 *   2. clear ALL --role-* indirection vars (no stale override lingers)
 *   3. resolve + set each override's fill (and computed `on`) from the live ramp
 */
function applyAppearance(prefs) {
  try {
    var root = document.documentElement;
    var p = normalizePrefs(prefs || getAppearancePrefs());

    // (1) theme attribute first — 'default' means no attribute.
    if (p.theme === 'default') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', p.theme);

    // (1b) contrast attribute — 'standard' means no attribute. Set before reads
    // so the active contrast block's palette ramp is live when we resolve below.
    if (p.contrast === 'standard') root.removeAttribute('data-contrast');
    else root.setAttribute('data-contrast', p.contrast);

    // (2) clear every indirection var so stale overrides don't linger.
    Object.keys(SLOT_VARS).forEach(function (slotKey) {
      var slot = SLOT_VARS[slotKey];
      if (slot.fill) root.style.removeProperty(slot.fill);
      if (slot.on) root.style.removeProperty(slot.on);
    });

    // (3) resolve + apply each override from the now-active palette.
    var computed = getComputedStyle(root);
    Object.keys(p.overrides).forEach(function (slotKey) {
      try {
        var slot = SLOT_VARS[slotKey];
        if (!slot) return;
        var o = p.overrides[slotKey];
        var hex = computed.getPropertyValue('--palette-' + o.role + '-' + o.tone).trim();
        // Empty (e.g. default theme lacks a ramp) → leave cleared so CSS fallback wins.
        if (!hex) return;
        root.style.setProperty(slot.fill, hex);
        if (slot.on) {
          var onHex = m3OnColor(computed, o.role, o.tone) || readableOn(hex);
          root.style.setProperty(slot.on, onHex);
        }
      } catch (slotErr) {
        // One bad slot must not abort the rest.
      }
    });
  } catch (e) {
    console.warn('applyAppearance failed', e);
  }
}

// ── Contrast diagnostics ───────────────────────────────────────────────────

/**
 * WCAG contrast for a slot's resolved colors, so the screen can warn on low contrast.
 *  - Slots WITH an `on` var (primaryButton, selectedChip): fill vs. resolved on-color,
 *    text thresholds (>=4.5 pass, >=3 large-only, else fail).
 *  - Slots WITHOUT an `on` var (switchOn, progressFill, focusAccent): fill vs. the app
 *    surface `--bg-base`, non-text large-element threshold (ok = ratio>=3).
 * Reads live computed styles; returns a safe default if unreadable.
 * @returns {{ ratio:Number, ok:Boolean, level:'pass'|'large-only'|'fail' }}
 */
function getOverrideContrast(slotKey) {
  var fallback = { ratio: 0, ok: false, level: 'fail' };
  try {
    var slot = SLOT_VARS[slotKey];
    if (!slot) return fallback;
    var root = document.documentElement;
    var computed = getComputedStyle(root);
    var fillHex = computed.getPropertyValue(slot.fill).trim();
    if (!fillHex) {
      // No explicit override → the --role-* var is cleared. Resolve the slot's
      // current color from its override (if any) or its nominal default tone.
      var ov = (getAppearancePrefs().overrides || {})[slotKey] || SLOT_DEFAULTS[slotKey];
      if (ov) fillHex = computed.getPropertyValue('--palette-' + ov.role + '-' + ov.tone).trim();
    }
    if (!fillHex) return fallback;

    if (slot.on) {
      var onHex = computed.getPropertyValue(slot.on).trim() || readableOn(fillHex);
      var r = contrastRatio(fillHex, onHex);
      if (r === null) return fallback;
      var level = r >= 4.5 ? 'pass' : (r >= 3 ? 'large-only' : 'fail');
      return { ratio: r, ok: r >= 4.5, level: level };
    }

    // Non-text UI element: compare against the app surface, large-element 3:1.
    var bgHex = computed.getPropertyValue('--bg-base').trim();
    var r2 = contrastRatio(fillHex, bgHex);
    if (r2 === null) return fallback;
    var level2 = r2 >= 4.5 ? 'pass' : (r2 >= 3 ? 'large-only' : 'fail');
    return { ratio: r2, ok: r2 >= 3, level: level2 };
  } catch (e) {
    return fallback;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

/** Read storage into state. Boot agent calls applyAppearance afterward. No DOM here. */
function loadAppearancePrefs() {
  var prefs = normalizePrefs(storageGet(STORAGE_KEY) || DEFAULT_PREFS);
  setState({ appearancePrefs: prefs });
  return prefs;
}

export {
  getAppearancePrefs,
  setTheme,
  setContrast,
  setOverride,
  clearOverride,
  resetAppearance,
  applyAppearance,
  getOverrideContrast,
  loadAppearancePrefs,
  DEFAULT_PREFS
};
