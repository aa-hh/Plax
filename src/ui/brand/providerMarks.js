/**
 * Official Plex + Jellyfin brand marks, as inline SVG for the server picker cards.
 * Source assets supplied by the user (Plex 2022 wordmark; Jellyfin icon-transparent).
 *
 * Plex: the black wordmark fills are swapped to `currentColor` so the mark reads
 *   on the dark TV surface (set `color` on the host); the gold chevron (#EBAF00)
 *   is kept literal as the brand accent.
 * Jellyfin: keeps its purple→blue brand gradient verbatim (the gradient IS the mark).
 */

/** Plex wordmark (viewBox 1000×461). Letters inherit currentColor; chevron stays gold. */
export function plexMarkSvg(opts) {
  var cls = (opts && opts.className) ? ' class="' + opts.className + '"' : '';
  return '<svg viewBox="0 0 1000 460.9" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plex"' + cls + '>' +
    '<path fill="currentColor" d="m 164.18919,82.43243 c -39.86487,0 -65.540543,11.48648 -87.162163,38.51351 V 91.21621 H 0 v 366.21621 c 0,0 1.3513514,0.67567 5.4054053,1.35135 5.4054057,1.35135 33.7837827,7.43243 54.7297287,-10.13514 18.243244,-15.54054 22.297295,-33.78378 22.297295,-54.05405 v -52.7027 c 22.297301,23.64864 47.297301,33.78378 82.432431,33.78378 75.67567,0 133.78378,-61.48648 133.78378,-143.24323 0,-88.51352 -56.08108,-150 -134.45945,-150 z m -14.86487,223.64864 c -42.56756,0 -76.351351,-35.13513 -76.351351,-77.7027 0,-41.89189 39.864871,-75.67567 76.351351,-75.67567 43.24324,0 76.35135,33.1081 76.35135,76.35135 0,43.24324 -33.78378,77.02702 -76.35135,77.02702 z"/>' +
    '<path fill="currentColor" d="m 408.1081,223.64864 c 0,31.75676 3.37838,70.27027 34.45946,112.16216 0.67567,0.67567 2.02702,2.7027 2.02702,2.7027 -12.83783,21.62162 -28.37837,36.48648 -49.32432,36.48648 -16.21622,0 -32.43243,-8.78378 -45.94595,-23.64864 -14.18918,-16.21622 -20.94594,-37.16216 -20.94594,-59.45946 V 0 h 79.05405 z"/>' +
    '<polygon fill="#EBAF00" transform="scale(6.7567568)" points="117.9,33.9 104.1,13.5 118.3,13.5 132,33.9 118.3,54.2 104.1,54.2"/>' +
    '<polygon fill="currentColor" transform="scale(6.7567568)" points="135.7,31.6 148,13.5 133.8,13.5 128.7,21"/>' +
    '<path fill="currentColor" d="m 869.59458,316.2162 c 0,0 16.2162,22.2973 16.2162,22.2973 15.54058,24.32432 35.8108,36.48648 59.45949,36.48648 25,-0.67567 42.56752,-22.29729 49.3243,-30.4054 0,0 -12.16218,-10.81081 -27.7027,-29.05405 -20.94598,-24.32432 -48.64868,-68.91892 -49.3243,-70.94594 z"/>' +
    '<path fill="currentColor" d="m 632.43242,287.16215 c -16.21622,14.86486 -27.02703,22.97297 -49.32432,22.97297 -39.86487,0 -62.83784,-28.37837 -66.21622,-59.45945 h 211.4865 c 1.35131,-4.05406 2.027,-9.45946 2.027,-18.24324 0,-85.81082 -62.83783,-150 -145.27026,-150 -78.37837,0 -142.56756,65.54054 -142.56756,147.29729 0,81.08108 64.18919,145.27026 144.59459,145.27026 56.08108,0 104.72973,-31.75675 131.08105,-87.83783 z M 585.8108,147.29729 c 35.13513,0 61.48648,22.97297 67.56756,53.37838 H 519.59458 c 6.75676,-31.75676 31.75676,-53.37838 66.21622,-53.37838 z"/>' +
  '</svg>';
}

/** Jellyfin icon (viewBox 512×512). Keeps the official purple→blue gradient. */
export function jellyfinMarkSvg(opts) {
  var cls = (opts && opts.className) ? ' class="' + opts.className + '"' : '';
  return '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Jellyfin"' + cls + '>' +
    '<defs><linearGradient id="jf-mark-grad" gradientUnits="userSpaceOnUse" x1="110.25" y1="213.3" x2="496.14" y2="436.09">' +
    '<stop offset="0" stop-color="#AA5CC3"/><stop offset="1" stop-color="#00A4DC"/></linearGradient></defs>' +
    '<path d="M256,201.6c-20.4,0-86.2,119.3-76.2,139.4s142.5,19.9,152.4,0S276.5,201.6,256,201.6z" fill="url(#jf-mark-grad)"/>' +
    '<path d="M256,23.3c-61.6,0-259.8,359.4-229.6,420.1s429.3,60,459.2,0S317.6,23.3,256,23.3z M406.5,390.8c-19.6,39.3-281.1,39.8-300.9,0s110.1-275.3,150.4-275.3S426.1,351.4,406.5,390.8z" fill="url(#jf-mark-grad)"/>' +
  '</svg>';
}

/** "Add a new server" glyph — an outlined circle with a centered plus. */
export function addServerGlyphSvg(opts) {
  var cls = (opts && opts.className) ? ' class="' + opts.className + '"' : '';
  return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Add a new server"' + cls + '>' +
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M50 34 V66 M34 50 H66" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
  '</svg>';
}
