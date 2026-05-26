/**
 * Shared outline icons for browsing hub nav and watchlist affordances.
 * Bookmark shape is identical everywhere (sidebar + detail screens).
 */

var ICON_CLASS = 'hub-icon';

function svgOpen(className, viewBox) {
  return '<svg class="' + className + '" xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '" aria-hidden="true" focusable="false">';
}

function homeIconSvg() {
  return svgOpen(ICON_CLASS + ' hub-icon--home', '0 0 24 24') +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" ' +
    'd="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/>' +
    '</svg>';
}

function bookmarkIconSvg(filled) {
  var cls = ICON_CLASS + ' hub-icon--bookmark';
  if (filled) cls += ' hub-icon--bookmark-filled';
  return svgOpen(cls, '0 0 24 24') +
    '<path fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.75" ' +
    'stroke-linejoin="round" d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z"/>' +
    '</svg>';
}

function tvIconSvg() {
  return svgOpen(ICON_CLASS + ' hub-icon--tv', '0 0 24 24') +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" ' +
    'd="M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M9 20h6"/>' +
    '</svg>';
}

function filmsIconSvg() {
  return svgOpen(ICON_CLASS + ' hub-icon--films', '0 0 24 24') +
    '<rect fill="none" stroke="currentColor" stroke-width="1.75" x="7" y="3" width="10" height="18" rx="1"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
    'd="M9 6.5h1.2M9 10h1.2M9 13.5h1.2M9 17h1.2M13.8 6.5H15M13.8 10H15M13.8 13.5H15M13.8 17H15"/>' +
    '</svg>';
}

function searchIconSvg() {
  return svgOpen(ICON_CLASS + ' hub-icon--search', '0 0 24 24') +
    '<circle fill="none" stroke="currentColor" stroke-width="1.75" cx="11" cy="11" r="6.5"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M16.5 16.5 21 21"/>' +
    '</svg>';
}

function settingsIconSvg() {
  return svgOpen(ICON_CLASS + ' hub-icon--settings', '0 0 24 24') +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
    'd="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" ' +
    'd="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 .33 1.82V15a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
    '</svg>';
}

function iconSvgForKind(kind, filled) {
  if (kind === 'home') return homeIconSvg();
  if (kind === 'watchlist') return bookmarkIconSvg(!!filled);
  if (kind === 'tv' || kind === 'show') return tvIconSvg();
  if (kind === 'films' || kind === 'movie') return filmsIconSvg();
  if (kind === 'search') return searchIconSvg();
  if (kind === 'settings') return settingsIconSvg();
  return homeIconSvg();
}

function libraryIconKind(lib) {
  var t = String(lib && lib.type || '').toLowerCase();
  if (t === 'movie' || t === '1') return 'films';
  if (t === 'show' || t === '2' || t === 'tv') return 'tv';
  return 'home';
}

export {
  homeIconSvg,
  bookmarkIconSvg,
  tvIconSvg,
  filmsIconSvg,
  searchIconSvg,
  settingsIconSvg,
  iconSvgForKind,
  libraryIconKind
};
