// Appearance preview — HOME screen mock.
// A recognizable, compact Home: left nav rail + immersive hero (with a Play
// button) + a horizontal 2:3 poster rail whose focused card carries a
// continue-watching progress bar. Built from REAL component classes so the
// live theme + per-slot overrides cascade in; decorative-only bits use
// `.appearance-chrome`. Selectable elements are focusable
// `<button class="appearance-target" data-slot="...">` — the shell delegates
// clicks/ENTER, so this module attaches NO handlers.
//
// Chrome53 / webOS4 safe: no color-mix, no :focus-within, vertical 2:3 cards.

function el(tag, className, html) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

// A focusable, selectable target. `sample` is the real-component markup; the
// label sits below it (styled by .appearance-target__label, never overlapping).
function target(slot, label, sample) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'appearance-target';
  btn.setAttribute('data-slot', slot);
  btn.appendChild(sample);
  btn.appendChild(el('span', 'appearance-target__label', label));
  return btn;
}

// A decorative (non-selectable) 2:3 poster card.
function chromeCard() {
  var card = el('div', 'media-card card row-item appearance-chrome');
  card.setAttribute('aria-hidden', 'true');
  card.appendChild(el('div', 'card-poster-wrap'));
  return card;
}

function buildHomePreview() {
  var root = el('div', 'appearance-mock appearance-mock--home');

  // ── Layout: nav rail (left) + main column (right) ────────────────────────
  var layout = el('div', 'home-layout appearance-mock__layout');

  // Left nav rail — real browsing-hub classes. The active item is the
  // selectedChip target; the rest are decorative chrome.
  var nav = el('nav', 'browsing-hub-nav appearance-mock__nav');

  var activeItem = el('span', 'browsing-hub-item active',
    '<span class="browsing-hub-item__label">Home</span>');
  nav.appendChild(target('selectedChip', 'Selected chip', activeItem));

  var navRest = el('div', 'appearance-chrome appearance-mock__nav-rest');
  navRest.appendChild(el('div', 'browsing-hub-item',
    '<span class="browsing-hub-item__label">Library</span>'));
  navRest.appendChild(el('div', 'browsing-hub-item',
    '<span class="browsing-hub-item__label">Search</span>'));
  nav.appendChild(navRest);
  layout.appendChild(nav);

  // Main column: hero + poster rail.
  var main = el('div', 'home-main appearance-mock__main');

  // ── Immersive hero ───────────────────────────────────────────────────────
  var hero = el('div', 'il-hero appearance-mock__hero');
  var scrim = el('div', 'il-hero__scrim appearance-chrome');
  hero.appendChild(scrim);
  var content = el('div', 'il-hero__content');
  content.appendChild(el('p', 'il-hero__label appearance-chrome', 'Movie'));
  content.appendChild(el('h2', 'il-hero__title', 'Featured Title'));
  content.appendChild(el('p', 'il-hero__meta appearance-chrome',
    '2026  ·  PG-13  ·  1h 52m'));

  // Hero Play button — real .btn.btn-primary → primaryButton slot.
  var playSample = el('span', 'btn btn-primary appearance-mock__play', 'Play');
  content.appendChild(target('primaryButton', 'Primary button', playSample));

  hero.appendChild(content);
  main.appendChild(hero);

  // ── Continue-watching label + poster rail ────────────────────────────────
  var section = el('div', 'row-section appearance-mock__row');
  section.appendChild(el('p', 'row-label appearance-chrome', 'Continue Watching'));

  var rail = el('div', 'row-scroll appearance-mock__rail');

  // Focused poster card → focusAccent slot (with a continue-watching bar that
  // doubles as the progressFill target sitting just beneath it).
  var focusedCard = el('div', 'media-card card row-item appearance-mock__card');
  focusedCard.appendChild(el('div', 'card-poster-wrap'));
  rail.appendChild(target('focusAccent', 'Focus accent', focusedCard));

  // Progress / seek fill — real .progress-track / .progress-fill.
  var progress = el('div', 'progress-track card-progress appearance-mock__progress');
  var fill = el('div', 'progress-fill');
  fill.style.width = '62%';
  progress.appendChild(fill);
  rail.appendChild(target('progressFill', 'Progress / seek', progress));

  // Trailing decorative cards so it reads as a rail.
  rail.appendChild(chromeCard());
  rail.appendChild(chromeCard());

  section.appendChild(rail);
  main.appendChild(section);

  layout.appendChild(main);
  root.appendChild(layout);
  return root;
}

export { buildHomePreview };
