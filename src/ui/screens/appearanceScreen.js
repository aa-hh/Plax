/**
 * Appearance theme-customizer screen (rebuilt).
 *
 * Fixed two-column layout:
 *   Header  — title + unified Theme segmented + Contrast segmented (Medium/High
 *             disabled with a hint only on the default theme).
 *   Tabs    — Home / Detail / Player / Settings switch the LEFT screen mock.
 *   Body    — left  `.appearance-preview > .appearance-stage` holds the active
 *                   buildXPreview() mock (real component classes; selectable
 *                   `[data-slot]` targets).
 *             right `.appearance-editor` holds the role/tone editor (empty hint
 *                   until a target is selected).
 *   Footer  — Reset to default + a transient "Saved ✓" affordance.
 *
 * Selection is event-delegated on `.appearance-stage [data-slot]` (click + ENTER)
 * → renderEditor(rightCol, slot, { onChange }) where onChange rebuilds the active
 * preview so the recolor shows live, keeping the selection.
 *
 * Chrome53 / webOS4 safe: string concat, var, native <button>, no template
 * literals in hot paths, no :focus-within. Layout/visuals come from the
 * `.appearance-*` classes in app.css (authored separately) — no inline-style strip.
 */

import { attachFocusNav, focusFirst } from '../focus.js';
import {
  getAppearancePrefs,
  setTheme,
  setContrast,
  resetAppearance
} from '../../settings/appearancePrefs.js';
import { buildHomePreview } from '../components/appearance/previewHome.js';
import { buildDetailPreview } from '../components/appearance/previewDetail.js';
import { buildPlayerPreview } from '../components/appearance/previewPlayer.js';
import { buildSettingsPreview } from '../components/appearance/previewSettings.js';
import {
  renderEditor,
  renderEditorEmpty
} from '../components/appearance/appearanceEditor.js';

var THEMES = [
  { key: 'default', label: 'Default' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'gold', label: 'Gold' },
  { key: 'teal', label: 'Teal' }
];

var CONTRAST_LEVELS = [
  { key: 'standard', label: 'Standard' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' }
];

var TABS = [
  { id: 'home', label: 'Home', build: buildHomePreview },
  { id: 'detail', label: 'Detail', build: buildDetailPreview },
  { id: 'player', label: 'Player', build: buildPlayerPreview },
  { id: 'settings', label: 'Settings', build: buildSettingsPreview }
];

function el(tag, className) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function builderFor(tabId) {
  for (var i = 0; i < TABS.length; i++) {
    if (TABS[i].id === tabId) return TABS[i].build;
  }
  return buildHomePreview;
}

function appearanceScreen(root, params, navigate) {
  var screen = el('div', 'screen appearance-screen appearance-layout');
  screen.innerHTML =
    '<div class="appearance-header">' +
    '<h1 class="appearance-title">Appearance</h1>' +
    '<div class="appearance-segmented" id="appearance-theme" data-focus-zone="appearance-theme"></div>' +
    '<div class="appearance-segmented" id="appearance-contrast" data-focus-zone="appearance-contrast"></div>' +
    '</div>' +
    '<div class="appearance-tabs" id="appearance-tabs" data-focus-zone="appearance-tabs"></div>' +
    '<div class="appearance-body">' +
    '<div class="appearance-preview" id="appearance-preview" data-focus-zone="appearance-preview">' +
    '<div class="appearance-stage" id="appearance-stage"></div>' +
    '</div>' +
    '<div class="appearance-editor appearance-editor--empty" id="appearance-editor" data-focus-zone="appearance-editor"></div>' +
    '</div>' +
    '<div class="appearance-actions" id="appearance-actions"></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  var themeEl = screen.querySelector('#appearance-theme');
  var contrastEl = screen.querySelector('#appearance-contrast');
  var tabsEl = screen.querySelector('#appearance-tabs');
  var stageEl = screen.querySelector('#appearance-stage');
  var editorEl = screen.querySelector('#appearance-editor');
  var actionsEl = screen.querySelector('#appearance-actions');

  var activeTab = 'home';
  var selectedSlot = null;
  var savedTimer = null;

  // ── Header: Theme segmented ─────────────────────────────────────────────
  // Active theme renders disabled (isNavFocusable skips disabled → D-pad
  // passes over it, matching the segmented-control convention).
  function renderTheme() {
    var prefs = getAppearancePrefs();
    themeEl.innerHTML = '';
    THEMES.forEach(function (t) {
      var isActive = prefs.theme === t.key;
      var chip = el('button', 'appearance-segmented__chip' +
        (isActive ? ' appearance-segmented__chip--active' : ''));
      chip.type = 'button';
      chip.tabIndex = 0;
      chip.setAttribute('data-theme-key', t.key);
      chip.textContent = t.label;
      if (isActive) {
        chip.disabled = true;
        chip.setAttribute('aria-current', 'true');
      } else {
        chip.addEventListener('click', function () {
          setTheme(t.key);
          flashSaved();
          // Theme switch repaints everything: the disabled chip moves, the
          // contrast lock state flips, and the preview recolors.
          renderTheme();
          renderContrast();
          rebuildPreview();
          refreshEditor();
          focusFirstThemeChip();
        });
      }
      themeEl.appendChild(chip);
    });
  }

  function focusFirstThemeChip() {
    var chips = themeEl.querySelectorAll('.appearance-segmented__chip');
    for (var i = 0; i < chips.length; i++) {
      if (!chips[i].disabled) { chips[i].focus(); return; }
    }
  }

  // ── Header: Contrast segmented ──────────────────────────────────────────
  // Medium/High are only authored for the non-default themes; on the default
  // (blue) theme they render disabled with a small hint.
  function renderContrast() {
    var prefs = getAppearancePrefs();
    var isDefaultTheme = prefs.theme === 'default';
    contrastEl.innerHTML = '';

    CONTRAST_LEVELS.forEach(function (lvl) {
      var isActive = prefs.contrast === lvl.key;
      var locked = isDefaultTheme && lvl.key !== 'standard';
      var chip = el('button', 'appearance-segmented__chip' +
        (isActive ? ' appearance-segmented__chip--active' : ''));
      chip.type = 'button';
      chip.tabIndex = 0;
      chip.setAttribute('data-contrast-key', lvl.key);
      chip.textContent = lvl.label;
      if (isActive) chip.setAttribute('aria-current', 'true');
      if (isActive || locked) {
        chip.disabled = true;
      } else {
        chip.addEventListener('click', function () {
          setContrast(lvl.key);
          flashSaved();
          renderContrast();
          rebuildPreview();
          refreshEditor();
        });
      }
      contrastEl.appendChild(chip);
    });

    if (isDefaultTheme) {
      var hint = el('span', 'appearance-segmented__hint');
      hint.textContent = 'Standard only on the default theme';
      contrastEl.appendChild(hint);
    }
  }

  // ── Tabs ────────────────────────────────────────────────────────────────
  function renderTabs() {
    tabsEl.innerHTML = '';
    TABS.forEach(function (tab) {
      var isActive = activeTab === tab.id;
      var btn = el('button', 'appearance-tab' +
        (isActive ? ' appearance-tab--active' : ''));
      btn.type = 'button';
      btn.tabIndex = 0;
      btn.setAttribute('data-tab', tab.id);
      btn.textContent = tab.label;
      if (isActive) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', function () {
        if (activeTab === tab.id) return;
        activeTab = tab.id;
        renderTabs();
        rebuildPreview();
      });
      tabsEl.appendChild(btn);
    });
  }

  // ── Preview stage ───────────────────────────────────────────────────────
  // Build the active screen mock, then re-apply the selection ring (the mock is
  // rebuilt from scratch each time so the override cascade recolors).
  function rebuildPreview() {
    stageEl.innerHTML = '';
    var mock;
    try {
      mock = builderFor(activeTab)();
    } catch (e) {
      mock = el('div', 'appearance-chrome');
    }
    stageEl.appendChild(mock);
    applySelectionRing();
  }

  function applySelectionRing() {
    var targets = stageEl.querySelectorAll('[data-slot]');
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (selectedSlot && t.getAttribute('data-slot') === selectedSlot) {
        t.classList.add('appearance-target--selected');
      } else {
        t.classList.remove('appearance-target--selected');
      }
    }
  }

  function selectSlot(slotKey) {
    selectedSlot = slotKey;
    applySelectionRing();
    editorEl.classList.remove('appearance-editor--empty');
    try {
      renderEditor(editorEl, slotKey, {
        onChange: function () {
          flashSaved();
          // Recolor the live preview, keep the current selection.
          rebuildPreview();
        }
      });
    } catch (e) {
      renderEditorEmpty(editorEl);
    }
    focusFirst(editorEl);
  }

  // Re-render the open editor in place (no focus move) so its tone ramp + role
  // chips reflect the active theme/contrast after those change.
  function refreshEditor() {
    if (!selectedSlot) return;
    try {
      renderEditor(editorEl, selectedSlot, {
        onChange: function () { flashSaved(); rebuildPreview(); }
      });
    } catch (e) { /* leave the current editor as-is on failure */ }
  }

  // Event-delegate selection on the stage (click + keyboard ENTER/SPACE).
  function onStageActivate(ev) {
    var node = ev.target;
    while (node && node !== stageEl && !node.getAttribute('data-slot')) {
      node = node.parentNode;
    }
    if (!node || node === stageEl) return;
    var slot = node.getAttribute('data-slot');
    if (!slot) return;
    if (ev.type === 'keydown') {
      var k = ev.key;
      if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return;
      ev.preventDefault();
    }
    selectSlot(slot);
  }
  stageEl.addEventListener('click', onStageActivate);
  stageEl.addEventListener('keydown', onStageActivate);

  // ── Footer: Reset + transient Saved ✓ ───────────────────────────────────
  function renderActions() {
    actionsEl.innerHTML = '';
    var reset = el('button', 'btn btn-outline appearance-reset');
    reset.type = 'button';
    reset.tabIndex = 0;
    reset.textContent = 'Reset to default';
    reset.addEventListener('click', function () {
      resetAppearance();
      selectedSlot = null;
      editorEl.classList.add('appearance-editor--empty');
      try { renderEditorEmpty(editorEl); } catch (e) { editorEl.innerHTML = ''; }
      renderTheme();
      renderContrast();
      rebuildPreview();
      flashSaved();
      focusFirstThemeChip();
    });
    actionsEl.appendChild(reset);

    var saved = el('span', 'appearance-save');
    saved.id = 'appearance-save';
    saved.setAttribute('role', 'status');
    saved.setAttribute('aria-live', 'polite');
    saved.textContent = 'Saved ✓';
    actionsEl.appendChild(saved);
  }

  // Show the transient "Saved ✓" affordance (overrides already auto-persist;
  // this is a trust signal only).
  function flashSaved() {
    var saved = actionsEl.querySelector('#appearance-save');
    if (!saved) return;
    saved.classList.add('appearance-save--show');
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      saved.classList.remove('appearance-save--show');
      savedTimer = null;
    }, 1600);
  }

  // ── Initial paint ───────────────────────────────────────────────────────
  renderTheme();
  renderContrast();
  renderTabs();
  rebuildPreview();
  try { renderEditorEmpty(editorEl); } catch (e) { editorEl.innerHTML = ''; }
  renderActions();

  setTimeout(function () {
    try { focusFirstThemeChip(); }
    catch (e) { focusFirst(screen); }
  }, 0);

  return {
    destroy: function () {
      if (savedTimer) { clearTimeout(savedTimer); savedTimer = null; }
      detachFocus();
    }
  };
}

export { appearanceScreen };
