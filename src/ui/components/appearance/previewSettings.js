/**
 * Settings-screen mock for the Appearance editor's left pane.
 *
 * A compact, recognizable mock of the Settings screen: an overline-titled
 * grouped card (.gt-settings-group / .gt-settings-card) holding a few real
 * .gt-list-item rows — a toggle switch (on state), a picker row showing a
 * selected value, and a plain focused list row. Three of these rows are wrapped
 * as selectable `.appearance-target` buttons so the shell can event-delegate on
 * [data-slot] (no click handlers here).
 *
 * Slots: switchOn (toggle), selectedChip (selected picker value), focusAccent
 * (a focused list row).
 *
 * Real component classes only — colors reflect the live theme + override
 * cascade. Chrome 53 / webOS 4 safe: plain DOM, string concat, no modern APIs.
 */

function el(tag, className) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * A selectable target: a focusable <button class="appearance-target"> holding
 * the real-component sample plus a label beneath it. The shell delegates clicks.
 */
function target(slot, sample, labelText) {
  var btn = el('button', 'appearance-target');
  btn.type = 'button';
  btn.tabIndex = 0;
  btn.setAttribute('data-slot', slot);
  btn.appendChild(sample);
  var label = el('span', 'appearance-target__label');
  label.textContent = labelText;
  btn.appendChild(label);
  return btn;
}

/** A real .gt-list-item row body (main label/sublabel + a trailing slot). */
function listItem(label, sublabel, extraClass) {
  var item = el('span', 'gt-list-item gt-settings-item' + (extraClass ? ' ' + extraClass : ''));
  var main = el('span', 'gt-list-item__main');
  var lbl = el('span', 'gt-list-item__label');
  lbl.textContent = label;
  main.appendChild(lbl);
  if (sublabel) {
    var sub = el('span', 'gt-list-item__sublabel');
    sub.textContent = sublabel;
    main.appendChild(sub);
  }
  item.appendChild(main);
  return item;
}

function buildSettingsPreview() {
  var stage = el('div', 'appearance-settings-mock');

  // Decorative screen title chrome so it reads as the Settings screen.
  var title = el('div', 'appearance-chrome appearance-settings-title');
  title.textContent = 'Settings';
  stage.appendChild(title);

  // Grouped settings card (real .gt-settings-group + .gt-settings-card).
  var group = el('section', 'gt-settings-group');
  var groupTitle = el('h2', 'gt-settings-group__title');
  groupTitle.textContent = 'Playback';
  group.appendChild(groupTitle);

  var card = el('div', 'gt-settings-card');
  group.appendChild(card);

  // ── switchOn: a list row with a toggle switch in the ON state ──
  var switchRow = listItem('Auto-play next episode', 'Continue to the next item automatically.');
  var swTrailing = el('span', 'gt-list-item__trailing');
  var sw = el('span', 'gt-switch gt-switch--on');
  sw.appendChild(el('span', 'gt-switch__knob'));
  swTrailing.appendChild(sw);
  switchRow.appendChild(swTrailing);
  card.appendChild(target('switchOn', switchRow, 'Switch (on)'));

  // ── selectedChip: a picker row showing the selected value ──
  var pickerRow = listItem('Video quality', null);
  var pkTrailing = el('span', 'gt-list-item__trailing');
  var val = el('span', 'gt-settings-value');
  val.textContent = 'Original';
  var chev = el('span', 'gt-settings-chevron');
  chev.innerHTML =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">' +
    '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  pkTrailing.appendChild(val);
  pkTrailing.appendChild(chev);
  pickerRow.appendChild(pkTrailing);
  card.appendChild(target('selectedChip', pickerRow, 'Selected value'));

  // ── focusAccent: a plain focused list row ──
  var focusRow = listItem('Subtitles', 'Default language and styling.', 'gt-list-item--selected');
  var frTrailing = el('span', 'gt-list-item__trailing');
  var frChev = el('span', 'gt-settings-chevron');
  frChev.innerHTML = chev.innerHTML;
  frTrailing.appendChild(frChev);
  focusRow.appendChild(frTrailing);
  card.appendChild(target('focusAccent', focusRow, 'Focus accent'));

  stage.appendChild(group);
  return stage;
}

export { buildSettingsPreview };
