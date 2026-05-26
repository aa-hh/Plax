import { renderSVG } from './vendor/uqr.mjs';

/** Local QR image (no third-party request; pairing token stays on-device). */
function qrDataUrl(text, size) {
  size = size || 256;
  var svg = renderSVG(text, { ecc: 'M', border: 2 });
  var sized = svg.replace(
    '<svg ',
    '<svg width="' + size + '" height="' + size + '" '
  );
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(sized);
}

export { qrDataUrl };
