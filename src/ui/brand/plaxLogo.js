/**
 * Plax brand logo — full "plax" wordmark and compact "x" mark.
 *
 * Paths sourced from Figma file JZ0qDjpVZrGhgxHDHgsBCZ:
 *   wordmark → node 51-57   mark → node 51-56
 *
 * Letters (p, l, a) use currentColor so they work on any surface.
 * The x mark uses fixed brand colors: purple→blue gradient (left chevron)
 * and amber gold (right chevron).
 */

export var PLAX_GRAD_TOP    = '#AA5CC3';
export var PLAX_GRAD_BOTTOM = '#00A4DC';
export var PLAX_GOLD        = '#EBAF00';

function gradDefs(id, x1, y1, x2, y2) {
  return '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse"' +
    ' x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' +
    '<stop offset="0" stop-color="' + PLAX_GRAD_TOP + '"/>' +
    '<stop offset="1" stop-color="' + PLAX_GRAD_BOTTOM + '"/>' +
    '</linearGradient></defs>';
}

/**
 * Full "plax" wordmark.
 * Source viewBox 76 157 → 1090 623; shifted to 0 0 via transform.
 * Letters inherit currentColor; x uses gradient + gold.
 */
export function plaxWordmarkSvg(opts) {
  var cls = (opts && opts.className) ? ' class="' + opts.className + '"' : '';
  return (
    '<svg viewBox="0 0 1015 466" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="plax"' + cls + '>' +
    gradDefs('plax-wm-g', '888.257', '247', '888.257', '522') +
    '<g transform="translate(-76,-157)">' +
      // gradient chevron behind letters
      '<path d="M887.243 384.838L794 247H889.946L982.514 384.838L889.946 522H794L887.243 384.838Z" fill="url(#plax-wm-g)"/>' +
      // p
      '<path fill="currentColor" d="M240.189 239.431C200.324 239.431 174.649 250.918 153.027 277.945V248.215H76V614.433C76 614.433 77.3514 615.108 81.4054 615.784C86.8108 617.135 115.189 623.216 136.135 605.649C154.378 590.108 158.432 571.864 158.432 551.594V498.891C180.73 522.54 205.73 532.675 240.865 532.675C316.541 532.675 374.649 471.188 374.649 389.431C374.649 300.918 318.568 239.431 240.189 239.431ZM225.324 463.081C182.757 463.081 148.973 427.945 148.973 385.377C148.973 343.485 188.838 309.702 225.324 309.702C268.568 309.702 301.676 342.81 301.676 386.053C301.676 429.296 267.892 463.081 225.324 463.081Z"/>' +
      // a
      '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M624.215 532C662.525 532 687.199 521.014 707.977 495.166C725 520 758 530.66 777 522.26V247C770 247 742.5 247 736.69 247C702.783 247 702.783 298 702.783 298C681.355 261.242 657.33 251.549 623.566 251.549C550.842 251.549 495 310.353 495 388.543C495 473.196 548.894 532 624.215 532ZM692.025 393.339C692.025 358.093 663.917 329 628.5 329C593.083 329 564.975 356.974 564.975 392.78C564.975 428.586 592.521 456 628.5 456C658.857 456 692.025 428.027 692.025 393.339Z"/>' +
      // l
      '<path fill="currentColor" d="M468.73 380.649C468.73 412.405 472.108 450.919 503.189 492.811C503.865 493.486 505.216 495.513 505.216 495.513C492.378 517.135 476.838 532 455.892 532C439.676 532 423.459 523.216 409.946 508.351C395.757 492.135 389 471.189 389 448.892V157H468.054L468.73 380.649Z"/>' +
      // gold upper
      '<path d="M1007.51 369.297L1090.62 247H994.676L960.216 297.676L1007.51 369.297Z" fill="' + PLAX_GOLD + '"/>' +
      // gold lower
      '<path d="M960.216 472L976.432 494.297C991.973 518.622 1012.24 530.784 1035.89 530.784C1060.89 530.108 1078.46 508.487 1085.22 500.378C1085.22 500.378 1073.05 489.568 1057.51 471.324C1036.57 447 1008.86 402.405 1008.19 400.378L960.216 472Z" fill="' + PLAX_GOLD + '"/>' +
      // gradient chevron on top (Figma z-order: also above letters)
      '<path d="M904.335 385L810.87 247H891.5L984.5 385L891.5 522H810.87L904.335 385Z" fill="url(#plax-wm-g)"/>' +
    '</g>' +
    '</svg>'
  );
}

/**
 * Compact "x" mark (collapsed rail / icon).
 * Source viewBox 98 55 → 395 339 from Figma node 51-56.
 */
export function plaxMarkSvg(opts) {
  var cls = (opts && opts.className) ? ' class="' + opts.className + '"' : '';
  return (
    '<svg viewBox="98 55 297 284" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="plax"' + cls + '>' +
    gradDefs('plax-mk-g', '192.257', '55', '192.257', '330') +
    // gold upper
    '<path d="M311.514 177.297L394.622 55H298.676L264.216 105.676L311.514 177.297Z" fill="' + PLAX_GOLD + '"/>' +
    // gold lower
    '<path d="M264.216 280L280.432 302.297C295.973 326.622 316.243 338.784 339.892 338.784C364.892 338.108 382.459 316.487 389.216 308.378C389.216 308.378 377.054 297.568 361.514 279.324C340.568 255 312.865 210.405 312.189 208.378L264.216 280Z" fill="' + PLAX_GOLD + '"/>' +
    // gradient chevron on top
    '<path d="M191.243 192.838L98 55H193.946L286.514 192.838L193.946 330H98L191.243 192.838Z" fill="url(#plax-mk-g)"/>' +
    '</svg>'
  );
}
