// Appearance preview: a compact, recognizable mock of the DETAIL screen.
// 2:3 poster on the left, info column on the right (title + meta), a
// genre/season chip, a Play primary button, and a small cast/related row.
// Real component classes (.btn.btn-primary, .detail-genre-pill,
// .detail-cast-card, etc.) so the live theme + override cascade shows through.
// Customizable elements are focusable .appearance-target buttons keyed by slot;
// the shell event-delegates on [data-slot], so NO click handlers here.
// Chrome53 / webOS4 safe: plain DOM, no color-mix / :focus-within, 2:3 cards only.

function el(tag, className) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// A focusable selection target. Inner sample uses the REAL component class;
// the label sits below/beside it (never overlapping) per the contract.
function target(slot, label, sampleEl) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'appearance-target';
  btn.setAttribute('data-slot', slot);
  btn.tabIndex = 0;
  btn.appendChild(sampleEl);
  var lbl = el('span', 'appearance-target__label');
  lbl.textContent = label;
  btn.appendChild(lbl);
  return btn;
}

export function buildDetailPreview() {
  var stage = el('div', 'appearance-detail-preview');

  // ── Hero row: 2:3 poster (decorative chrome) + info column ──────────────
  var hero = el('div', 'appearance-detail-hero appearance-chrome');

  var posterWrap = el('div', 'appearance-detail-poster-wrap');
  var poster = el('div', 'detail-poster appearance-detail-poster appearance-chrome');
  posterWrap.appendChild(poster);
  hero.appendChild(posterWrap);

  var info = el('div', 'appearance-detail-info');

  var title = el('h1', 'detail-movie-title appearance-detail-title');
  title.textContent = 'Sample Title';
  info.appendChild(title);

  var meta = el('p', 'detail-meta appearance-chrome');
  meta.textContent = '2024 · 1h 52m · PG-13';
  info.appendChild(meta);

  // selectedChip — a genre/season chip (.detail-genre-pill).
  var genreChip = el('span', 'detail-genre-pill');
  genreChip.textContent = 'Sci-Fi';
  info.appendChild(target('selectedChip', 'Selected chip', genreChip));

  // primaryButton — the Play action (.btn.btn-primary).
  var playBtn = el('span', 'btn btn-primary detail-play-btn');
  playBtn.textContent = 'Play';
  info.appendChild(target('primaryButton', 'Primary button', playBtn));

  hero.appendChild(info);
  stage.appendChild(hero);

  // ── Cast / related row ──────────────────────────────────────────────────
  var castSection = el('section', 'appearance-detail-cast appearance-chrome');
  var castHeading = el('p', 'row-label appearance-detail-cast-heading');
  castHeading.textContent = 'Cast & Related';
  castSection.appendChild(castHeading);

  var castRow = el('div', 'appearance-detail-cast-row');

  // focusAccent — a cast/related card (.detail-cast-card).
  var castCard = el('span', 'detail-cast-card appearance-detail-cast-card');
  var avatar = el('span', 'detail-cast-avatar');
  var fallback = el('span', 'detail-cast-avatar-fallback');
  fallback.textContent = 'AB';
  avatar.appendChild(fallback);
  castCard.appendChild(avatar);
  var castName = el('span', 'detail-cast-name');
  castName.textContent = 'Actor';
  castCard.appendChild(castName);
  castRow.appendChild(target('focusAccent', 'Focus accent', castCard));

  // Decorative sibling cards so the row reads as a rail, not one card.
  for (var i = 0; i < 2; i++) {
    var ghost = el('span', 'detail-cast-card appearance-detail-cast-card appearance-chrome');
    var gAvatar = el('span', 'detail-cast-avatar');
    ghost.appendChild(gAvatar);
    var gName = el('span', 'detail-cast-name');
    gName.textContent = i === 0 ? 'Actor' : 'Related';
    ghost.appendChild(gName);
    castRow.appendChild(ghost);
  }

  castSection.appendChild(castRow);
  stage.appendChild(castSection);

  return stage;
}
