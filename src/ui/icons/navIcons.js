/**
 * Shared icons for the browsing-hub nav and watchlist affordances.
 *
 * Source: **Material Symbols (Google), "Rounded" style, weight 400** — the
 * official Google design icon library (https://fonts.google.com/icons,
 * https://m3.material.io/styles/icons). Path data is inlined (not the icon
 * font) so there is no runtime/CDN dependency and everything renders on
 * Chromium 53 / webOS 4 over file://. All glyphs are single-colour
 * (fill: currentColor) so they inherit the nav item's colour/focus state.
 *
 * Material Symbols use a 960×960 grid with a `0 -960 960 960` viewBox (the
 * baseline-anchored coordinate space the library ships in) — kept verbatim so
 * the paths are byte-for-byte the published glyphs. NO fill-rule is set:
 * Material Symbols rely on the default nonzero winding (evenodd breaks the
 * counters on several glyphs).
 *
 * Nav glyphs come in OUTLINED (idle) and FILLED (active/selected) pairs, the
 * standard Material navigation pattern; `iconSvgForKind(kind, filled)` picks.
 */

var ICON_CLASS = 'hub-icon';
var MS_VIEWBOX = '0 -960 960 960';

function svgIcon(modifier, path, viewBox) {
  return '<svg class="' + ICON_CLASS + (modifier ? ' ' + modifier : '') +
    '" xmlns="http://www.w3.org/2000/svg" viewBox="' + (viewBox || MS_VIEWBOX) + '" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="' + path + '"/>' +
    '</svg>';
}

// ── Material Symbols Rounded path data (24px @ wght 400) ─────────────────────
var P_HOME = 'M220-180h150v-220q0-12.75 8.63-21.38Q387.25-430 400-430h160q12.75 0 21.38 8.62Q590-412.75 590-400v220h150v-390L480-765 220-570v390Zm-60 0v-390q0-14.25 6.38-27 6.37-12.75 17.62-21l260-195q15.68-12 35.84-12Q500-825 516-813l260 195q11.25 8.25 17.63 21 6.37 12.75 6.37 27v390q0 24.75-17.62 42.37Q764.75-120 740-120H560q-12.75 0-21.37-8.63Q530-137.25 530-150v-220H430v220q0 12.75-8.62 21.37Q412.75-120 400-120H220q-24.75 0-42.37-17.63Q160-155.25 160-180Zm320-293Z';
var P_HOME_FILL = 'M160-180v-390q0-14.25 6.38-27 6.37-12.75 17.62-21l260-195q15.68-12 35.84-12Q500-825 516-813l260 195q11.25 8.25 17.63 21 6.37 12.75 6.37 27v390q0 24.75-17.62 42.37Q764.75-120 740-120H590q-12.75 0-21.37-8.63Q560-137.25 560-150v-220q0-12.75-8.62-21.38Q542.75-400 530-400H430q-12.75 0-21.37 8.62Q400-382.75 400-370v220q0 12.75-8.62 21.37Q382.75-120 370-120H220q-24.75 0-42.37-17.63Q160-155.25 160-180Z';
var P_BOOKMARK = 'm480-240-196 84q-30 13-57-4.76-27-17.75-27-50.24v-574q0-24 18-42t42-18h440q24 0 42 18t18 42v574q0 32.49-27 50.24Q706-143 676-156l-196-84Zm0-64 220 93v-574H260v574l220-93Zm0-481H260h440-220Z';
var P_BOOKMARK_FILL = 'm480-240-196 84q-30 13-57-5t-27-50v-574q0-24 18-42t42-18h440q24 0 42 18t18 42v574q0 32-27 50t-57 5l-196-84Z';
var P_SEARCH = 'M378-329q-108.16 0-183.08-75Q120-479 120-585t75-181q75-75 181.5-75t181 75Q632-691 632-584.85 632-542 618-502q-14 40-42 75l242 240q9 8.56 9 21.78T818-143q-9 9-22.22 9-13.22 0-21.78-9L533-384q-30 26-69.96 40.5Q423.08-329 378-329Zm-1-60q81.25 0 138.13-57.5Q572-504 572-585t-56.87-138.5Q458.25-781 377-781q-82.08 0-139.54 57.5Q180-666 180-585t57.46 138.5Q294.92-389 377-389Z';
var P_SETTINGS = 'M421-80q-14 0-25-9t-13-23l-15-94q-19-7-40-19t-37-25l-86 40q-14 6-28 1.5T155-226L97-330q-8-13-4.5-27t15.5-23l80-59q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521l-80-59q-12-9-15.5-23t4.5-27l58-104q8-13 22-17.5t28 1.5l86 40q16-13 37-25t40-18l15-95q2-14 13-23t25-9h118q14 0 25 9t13 23l15 94q19 7 40.5 18.5T669-710l86-40q14-6 27.5-1.5T804-734l59 104q8 13 4.5 27.5T852-580l-80 57q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l80 58q12 8 15.5 22.5T863-330l-58 104q-8 13-22 17.5t-28-1.5l-86-40q-16 13-36.5 25.5T592-206l-15 94q-2 14-13 23t-25 9H421Zm15-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z';
var P_SETTINGS_FILL = 'M421-80q-14 0-25-9t-13-23l-15-94q-19-7-40-19t-37-25l-86 40q-14 6-28 1.5T155-226L97-330q-8-13-4.5-27t15.5-23l80-59q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521l-80-59q-12-9-15.5-23t4.5-27l58-104q8-13 22-17.5t28 1.5l86 40q16-13 37-25t40-18l15-95q2-14 13-23t25-9h118q14 0 25 9t13 23l15 94q19 7 40.5 18.5T669-710l86-40q14-6 27.5-1.5T804-734l59 104q8 13 4.5 27.5T852-580l-80 57q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l80 58q12 8 15.5 22.5T863-330l-58 104q-8 13-22 17.5t-28-1.5l-86-40q-16 13-36.5 25.5T592-206l-15 94q-2 14-13 23t-25 9H421Zm59-270q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Z';
var P_TV = 'M140-200q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H630v50q0 12.75-8.62 21.37Q612.75-120 600-120H360q-12.75 0-21.37-8.63Q330-137.25 330-150v-50H140Zm0-60h680v-520H140v520Zm0 0v-520 520Z';
var P_TV_FILL = 'M140-200q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H630v50q0 13-8.5 21.5T600-120H360q-13 0-21.5-8.5T330-150v-50H140Z';
var P_MOVIE = 'm140-800 58 119q7.73 15.4 22.08 24.2Q234.44-648 251-648q32.5 0 49.25-27.46T303-732l-33-68h89l58 119q7.73 15.4 22.08 24.2Q453.44-648 470-648q32.5 0 49.25-27.46T522-732l-33-68h89l58 119q7.73 15.4 22.08 24.2Q672.44-648 689-648q32.5 0 49.25-27.46T741-732l-33-68h112q24 0 42 18t18 42v520q0 24-18 42t-42 18H140q-24 0-42-18t-18-42v-520q0-24 18-42t42-18Zm0 212v368h680v-368H140Zm0 0v368-368Z';
var P_MOVIE_FILL = 'm140-800 58 119q8 15 22 24t31 9q32 0 49-27.5t3-56.5l-33-68h89l58 119q8 15 22 24t31 9q32 0 49-27.5t3-56.5l-33-68h89l58 119q8 15 22 24t31 9q32 0 49-27.5t3-56.5l-33-68h112q24 0 42 18t18 42v520q0 24-18 42t-42 18H140q-24 0-42-18t-18-42v-520q0-24 18-42t42-18Z';
var P_LIBRARY = 'M655-521q11-6.8 11-18.9 0-12.1-11-19.1L459-685q-11-8-23-1.44-12 6.55-12 20.44v252q0 13.89 12 20.44 12 6.56 23-1.44l196-126ZM260-200q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h560q24 0 42 18t18 42v560q0 24-18 42t-42 18H260Zm0-60h560v-560H260v560ZM140-80q-24 0-42-18t-18-42v-590q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v590h590q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32Q742.75-80 730-80H140Zm120-740v560-560Z';
var P_LIBRARY_FILL = 'M655-521q11-7 11-19t-11-19L459-685q-11-8-23-1.5T424-666v252q0 14 12 20.5t23-1.5l196-126ZM260-200q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h560q24 0 42 18t18 42v560q0 24-18 42t-42 18H260ZM140-80q-24 0-42-18t-18-42v-590q0-13 8.5-21.5T110-760q13 0 21.5 8.5T140-730v590h590q13 0 21.5 8.5T760-110q0 13-8.5 21.5T730-80H140Z';
var P_SUBTITLES = 'M140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm0-60h680v-520H140v520Zm0 0v-520 520Zm130-130h300q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H270q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm120-120h300q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H390q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm-98.5-8.68q8.5-8.67 8.5-21.5 0-12.82-8.68-21.32-8.67-8.5-21.5-8.5-12.82 0-21.32 8.68-8.5 8.67-8.5 21.5 0 12.82 8.68 21.32 8.67 8.5 21.5 8.5 12.82 0 21.32-8.68Zm420 120q8.5-8.67 8.5-21.5 0-12.82-8.68-21.32-8.67-8.5-21.5-8.5-12.82 0-21.32 8.68-8.5 8.67-8.5 21.5 0 12.82 8.68 21.32 8.67 8.5 21.5 8.5 12.82 0 21.32-8.68Z';
// "tune" (sliders) — Quality / playback tuning action.
var P_TUNE = 'M435.5-128.63Q427-137.25 427-150v-165q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v53h323q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H487v52q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM150-202q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h187q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Zm165.5-174.63Q307-385.25 307-398v-52H150q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h157v-54q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v166q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM457-450q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h353q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H457Zm144.5-173.63Q593-632.25 593-645v-165q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v52h157q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H653v53q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM150-698q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h353q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Z';
// "more_horiz" — overflow / More-actions affordance.
var P_MORE = 'M207.86-432Q188-432 174-446.14t-14-34Q160-500 174.14-514t34-14Q228-528 242-513.86t14 34Q256-460 241.86-446t-34 14Zm272 0Q460-432 446-446.14t-14-34Q432-500 446.14-514t34-14Q500-528 514-513.86t14 34Q528-460 513.86-446t-34 14Zm272 0Q732-432 718-446.14t-14-34Q704-500 718.14-514t34-14Q772-528 786-513.86t14 34Q800-460 785.86-446t-34 14Z';
// "star" (filled) — rating glyph when no official-source logo exists.
var P_STAR = 'M480-269 294-157q-8 5-17 4.5t-16-5.5q-7-5-10.5-13t-1.5-18l49-212-164-143q-8-7-9.5-15.5t.5-16.5q2-8 9-13.5t17-6.5l217-19 84-200q4-9 12-13.5t16-4.5q8 0 16 4.5t12 13.5l84 200 217 19q10 1 17 6.5t9 13.5q2 8 .5 16.5T826-544L662-401l49 212q2 10-1.5 18T699-158q-7 5-16 5.5t-17-4.5L480-269Z';

function starIconSvg(modifier) {
  return svgIcon(modifier, P_STAR);
}

function homeIconSvg(filled) { return svgIcon('hub-icon--home', filled ? P_HOME_FILL : P_HOME); }
function bookmarkIconSvg(filled) {
  return svgIcon('hub-icon--bookmark' + (filled ? ' hub-icon--bookmark-filled' : ''),
    filled ? P_BOOKMARK_FILL : P_BOOKMARK);
}
function tvIconSvg(filled) { return svgIcon('hub-icon--tv', filled ? P_TV_FILL : P_TV); }
function filmsIconSvg(filled) { return svgIcon('hub-icon--films', filled ? P_MOVIE_FILL : P_MOVIE); }
function searchIconSvg() { return svgIcon('hub-icon--search', P_SEARCH); }
function settingsIconSvg(filled) { return svgIcon('hub-icon--settings', filled ? P_SETTINGS_FILL : P_SETTINGS); }
function libraryIconSvg(filled) { return svgIcon('hub-icon--library', filled ? P_LIBRARY_FILL : P_LIBRARY); }
function subtitlesIconSvg() { return svgIcon('hub-icon--subtitles', P_SUBTITLES); }
function qualityIconSvg() { return svgIcon('hub-icon--quality', P_TUNE); }
function moreOptionsIconSvg() { return svgIcon('hub-icon--more', P_MORE); }

function iconSvgForKind(kind, filled) {
  if (kind === 'home') return homeIconSvg(filled);
  if (kind === 'watchlist') return bookmarkIconSvg(!!filled);
  if (kind === 'tv' || kind === 'show') return tvIconSvg(filled);
  if (kind === 'films' || kind === 'movie') return filmsIconSvg(filled);
  if (kind === 'search') return searchIconSvg();
  if (kind === 'settings') return settingsIconSvg(filled);
  return libraryIconSvg(filled);
}

function libraryIconKind(lib) {
  var t = String(lib && lib.type || '').toLowerCase();
  if (t === 'movie' || t === '1') return 'films';
  if (t === 'show' || t === '2' || t === 'tv') return 'tv';
  return 'library';
}

export {
  homeIconSvg,
  bookmarkIconSvg,
  tvIconSvg,
  filmsIconSvg,
  searchIconSvg,
  settingsIconSvg,
  subtitlesIconSvg,
  qualityIconSvg,
  moreOptionsIconSvg,
  starIconSvg,
  iconSvgForKind,
  libraryIconKind
};
