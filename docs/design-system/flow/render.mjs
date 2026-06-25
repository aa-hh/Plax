/**
 * XPlay user-flow thumbnail renderer  (living reference — see docs/design-system/user-flow.md)
 *
 * Renders a recognizable PNG of every screen / state in the app's user flow, using
 * the REAL src/styles/app.css + the REAL pure components (brand marks, card/list
 * markup classes) + representative mock data. Re-run this whenever a flow or screen
 * changes, then refresh the matching section of the Figma board (fileKey in user-flow.md).
 *
 *   node docs/design-system/flow/render.mjs            # render all
 *   node docs/design-system/flow/render.mjs provider-picker server-picker-launch   # subset
 *
 * Output: docs/design-system/flow/thumbnails/<name>.png  (1920×1080, app-native canvas)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { plexMarkSvg, jellyfinMarkSvg, addServerGlyphSvg } from '../../../src/ui/brand/providerMarks.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..', '..');
const CSS = join(REPO, 'src', 'styles', 'app.css');
const OUT = join(__dir, 'thumbnails');
const TMP = join(__dir, '.tmp');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// ── shared helpers ─────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Wrap a screen's inner HTML in the real app shell + CSS, optionally focusing one element. */
function page(screenClass, inner, focusSel) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${CSS}">
<style>html,body{margin:0;background:#131314}.screen{min-height:1080px}</style></head>
<body><div class="screen ${screenClass}">${inner}</div>
<script>
  document.documentElement.classList.add('caps-motion');
  ${focusSel ? `var f=document.querySelector(${JSON.stringify(focusSel)});if(f&&f.focus)f.focus();` : ''}
</script></body></html>`;
}

// Provider brand logos — copied verbatim from providerPickerScreen.js (wordmark + text).
const PLEX_LOGO =
  '<svg class="provider-card__logo" viewBox="0 0 220 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plex">' +
  '<path d="M20 8 L44 32 L20 56 L33 56 L57 32 L33 8 Z" fill="#E5A00D"/>' +
  '<text x="74" y="46" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="800" letter-spacing="2" fill="#E5A00D">PLEX</text></svg>';
const JELLYFIN_LOGO =
  '<svg class="provider-card__logo" viewBox="0 0 250 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Jellyfin">' +
  '<defs><linearGradient id="jfg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#AA5CC3"/><stop offset="1" stop-color="#00A4DC"/></linearGradient></defs>' +
  '<path d="M32 8c-6 9-16 25-16 31 0 5.3 7.2 9 16 9s16-3.7 16-9c0-6-10-22-16-31z" fill="url(#jfg)" opacity="0.5"/>' +
  '<path d="M32 22c-3.4 5.4-9 14.5-9 17.6 0 2.9 4 5.2 9 5.2s9-2.3 9-5.2c0-3.1-5.6-12.2-9-17.6z" fill="url(#jfg)"/>' +
  '<text x="72" y="44" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#F2F2F7">Jellyfin</text></svg>';

function providerCard(id, desc, logo, brand) {
  return `<button class="provider-card card" data-provider="${id}" data-brand="${brand}" tabindex="0">` +
    `<span class="provider-card__media">${logo}</span><span class="provider-card__desc">${desc}</span></button>`;
}

// QR placeholder (the real screen loads a remote QR image; a static block stands in).
const QR_PLACEHOLDER =
  '<svg width="220" height="220" viewBox="0 0 29 29" xmlns="http://www.w3.org/2000/svg" style="background:#fff;border-radius:8px">' +
  Array.from({ length: 80 }).map(() => {
    const x = Math.floor(Math.random() * 29), y = Math.floor(Math.random() * 29);
    return `<rect x="${x}" y="${y}" width="1" height="1" fill="#111"/>`;
  }).join('') +
  '<rect x="1" y="1" width="7" height="7" fill="none" stroke="#111" stroke-width="1"/>' +
  '<rect x="21" y="1" width="7" height="7" fill="none" stroke="#111" stroke-width="1"/>' +
  '<rect x="1" y="21" width="7" height="7" fill="none" stroke="#111" stroke-width="1"/></svg>';

// ── server-picker cards (real markup from serverPickerScreen.js) ─────────────
function savedServerCard(brand, caption) {
  const logo = brand === 'plex' ? plexMarkSvg({ className: 'server-card__logo' }) : jellyfinMarkSvg({ className: 'server-card__logo' });
  return `<button class="server-card" data-brand="${brand}" tabindex="0">` +
    `<span class="server-card__media">${logo}</span><span class="server-card__label">${esc(caption)}</span></button>`;
}
const addServerCard =
  `<button class="server-card server-card--add" tabindex="0">` +
  `<span class="server-card__media">${addServerGlyphSvg({ className: 'server-card__glyph' })}</span>` +
  `<span class="server-card__label">Add a new server</span></button>`;

function serverPicker(withBack) {
  return `<h1 class="screen-title">Choose a server</h1>` +
    `<p class="screen-subtitle">Pick a saved server or add a new one. Your saved servers stay linked — switching never removes them.</p>` +
    `<div class="server-card-grid">${savedServerCard('jellyfin', 'http://192.168.1.10:8096')}${savedServerCard('plex', "alec's Plex")}${addServerCard}</div>` +
    (withBack ? `<button class="btn server-picker-back" tabindex="0">Back</button>` : '');
}

// ── jellyfin login steps ─────────────────────────────────────────────────────
function jfLogin(activeStep) {
  const step = (id, active, body) => `<div class="login-step${active ? ' is-active' : ''}" id="${id}">${body}</div>`;
  return `<h1 class="screen-title">Connect to Jellyfin</h1>` +
    `<p class="screen-subtitle" id="jf-subtitle">${activeStep === 'server' ? 'Enter your Jellyfin server address to begin.' : 'Connected to LivingRoom.'}</p>` +
    step('step-server', activeStep === 'server',
      `<div class="login-fields"><div class="login-field"><span class="login-field__label">Server address</span>` +
      `<button class="btn login-field__btn" id="jf-url" tabindex="0">http://192.168.1.10:8096</button></div></div>` +
      `<div class="login-actions"><button class="btn btn-primary" id="jf-connect" tabindex="0">Connect</button></div>`) +
    step('step-quickconnect', activeStep === 'quickconnect',
      `<p class="screen-subtitle">On another device, open your Jellyfin app, go to <strong>Quick Connect</strong>, and enter this code:</p>` +
      `<p class="pairing-code">734 912</p><p class="status-msg">Waiting for approval…</p>` +
      `<div class="login-actions"><button class="btn" id="jf-use-password" tabindex="0">Use username &amp; password</button></div>`) +
    step('step-password', activeStep === 'password',
      `<div class="login-fields"><div class="login-field"><span class="login-field__label">Username</span>` +
      `<button class="btn login-field__btn" tabindex="0">alec</button></div>` +
      `<div class="login-field"><span class="login-field__label">Password</span>` +
      `<button class="btn login-field__btn" tabindex="0">••••••••</button></div></div>` +
      `<div class="login-actions"><button class="btn btn-primary" tabindex="0">Sign in</button></div>`) +
    `<button class="btn login-switch-provider" tabindex="0">Use a different service</button>`;
}

// ── screen registry ──────────────────────────────────────────────────────────
const SCREENS = [
  // §1 Onboarding & Server Selection
  { name: 'provider-picker', cls: 'screen-center provider-picker', focus: '.provider-card[data-brand="plex"]',
    html: `<h1 class="screen-title">Choose your media server</h1>` +
      `<p class="screen-subtitle">XPlay works with Plex or Jellyfin. Pick the one you use — you can switch later by signing out.</p>` +
      `<div class="provider-cards">${providerCard('plex', 'Sign in with your plex.tv account and pick a server', PLEX_LOGO, 'plex')}${providerCard('jellyfin', 'Connect directly to your own Jellyfin server', JELLYFIN_LOGO, 'jellyfin')}</div>` },
  { name: 'plex-pairing', cls: 'screen-center pairing-screen', focus: '#btn-retry',
    html: `<h1 class="screen-title">Sign in to Plex</h1>` +
      `<p class="screen-subtitle">Visit <strong>plex.tv/link</strong> and enter this code, or scan the QR code</p>` +
      `<div class="pairing-layout pairing-layout-centered"><div class="pairing-qr">${QR_PLACEHOLDER}</div>` +
      `<div class="pairing-code-block"><p class="pairing-code">QКF8</p><p class="status-msg">Waiting for sign-in…</p>` +
      `<div class="pairing-actions"><button class="btn" id="btn-retry" tabindex="0">Refresh code</button>` +
      `<button class="btn login-switch-provider" tabindex="0">Use a different service</button></div></div></div>` },
  { name: 'jf-login-url', cls: 'screen-center jellyfin-login', focus: '#jf-url', html: jfLogin('server') },
  { name: 'jf-login-quickconnect', cls: 'screen-center jellyfin-login', focus: '#jf-use-password', html: jfLogin('quickconnect') },
  { name: 'jf-login-password', cls: 'screen-center jellyfin-login', focus: '.login-field__btn', html: jfLogin('password') },
  { name: 'server-picker-launch', cls: 'screen-center server-picker-screen', focus: '.server-card', html: serverPicker(false) },
  { name: 'server-picker-settings', cls: 'screen-center server-picker-screen', focus: '.server-card', html: serverPicker(true) },
];

// ── headless-chrome render of one HTML string → png ──────────────────────────
function shoot(name, html, w, h) {
  const htmlPath = join(TMP, name + '.html');
  const pngPath = join(OUT, name + '.png');
  writeFileSync(htmlPath, html);
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, '--virtual-time-budget=1500',
    '--screenshot=' + pngPath, 'file://' + htmlPath,
  ], { stdio: 'ignore' });
  console.log('rendered', name + '.png');
}

// ── section composites (screens + SVG arrows + labels → one board image) ──────
const TH_W = 460, TH_H = 259;  // thumbnail box in a composite (16:9)

/** A screen thumbnail + caption at (x,y) in a composite. */
function thumb(name, x, y, caption) {
  return `<img class="th" src="file://${join(OUT, name + '.png')}" style="left:${x}px;top:${y}px">` +
    `<div class="cap" style="left:${x}px;top:${y - 30}px;width:${TH_W}px">${esc(caption)}</div>`;
}
/** A non-screen node box (Home, Settings entry, launch chip). */
function box(x, y, w, h, title, sub, accent) {
  return `<div class="box${accent ? ' box--accent' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">` +
    `<div class="box__t">${esc(title)}</div>${sub ? `<div class="box__s">${esc(sub)}</div>` : ''}</div>`;
}
/** SVG arrow from (x1,y1)→(x2,y2) with a midpoint label; opts:{dashed,color,curve,lx,ly}. */
function arrow(x1, y1, x2, y2, label, opts = {}) {
  const c = opts.color || '#A8C7FA';
  const dash = opts.dashed ? ' stroke-dasharray="9 7"' : '';
  const path = `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${c}" stroke-width="3"${dash} marker-end="url(#ah)"/>`;
  let lab = '';
  if (label) {
    const mx = opts.lx != null ? opts.lx : (x1 + x2) / 2;
    const my = opts.ly != null ? opts.ly : (y1 + y2) / 2;
    const w = label.length * 8.2 + 18;
    lab = `<g transform="translate(${mx - w / 2}, ${my - 15})">` +
      `<rect width="${w}" height="26" rx="13" fill="#1f1f22" stroke="#3a3c3e"/>` +
      `<text x="${w / 2}" y="17" text-anchor="middle" font-family="Inter,Arial" font-size="14" fill="#E3E3E3">${esc(label)}</text></g>`;
  }
  return { path, lab };
}
function laneLabel(x, y, txt) {
  return `<div class="lane" style="left:${x}px;top:${y}px">${esc(txt)}</div>`;
}

function composite(name, w, h, parts) {
  const arrows = parts.arrows || [];
  const svg = `<svg class="ov" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><marker id="ah" markerWidth="11" markerHeight="11" refX="8" refY="4" orient="auto">` +
    `<path d="M0 0 L9 4 L0 8 z" fill="#A8C7FA"/></marker></defs>` +
    arrows.map((a) => a.path).join('') + arrows.map((a) => a.lab).join('') + `</svg>`;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#0e0e0f;width:${w}px;height:${h}px;font-family:Inter,Arial,sans-serif}
  .title{position:absolute;left:60px;top:46px;color:#E3E3E3;font-size:34px;font-weight:700}
  .sub{position:absolute;left:60px;top:92px;color:#9aa0a6;font-size:18px}
  .th{position:absolute;width:${TH_W}px;height:${TH_H}px;border-radius:10px;border:1px solid #313131;object-fit:cover}
  .cap{position:absolute;color:#cfd2d0;font-size:15px;font-weight:600;text-align:left}
  .lane{position:absolute;color:#A8C7FA;font-size:19px;font-weight:700;letter-spacing:.04em}
  .box{position:absolute;border-radius:12px;background:#161718;border:1px solid #2c2e30;display:flex;flex-direction:column;justify-content:center;padding:0 22px;box-sizing:border-box}
  .box--accent{background:#102032;border:2px solid #A8C7FA}
  .box__t{color:#E9EDF5;font-size:24px;font-weight:700}
  .box__s{color:#c5c8c6;font-size:14px;margin-top:8px;white-space:pre-line}
  .ov{position:absolute;left:0;top:0;pointer-events:none}
  .legend{position:absolute;color:#9aa0a6;font-size:14px;line-height:1.7}
</style></head><body>
  <div class="title">${esc(parts.title)}</div>${parts.sub ? `<div class="sub">${esc(parts.sub)}</div>` : ''}
  ${(parts.lanes || []).join('')}
  ${(parts.boxes || []).join('')}
  ${(parts.thumbs || []).join('')}
  ${svg}
  ${parts.legend || ''}
</body></html>`;
  shoot(name, html, w, h);
}

// edge-midpoint helpers for a thumbnail placed at (x,y)
const R = (x) => x + TH_W, B = (y) => y + TH_H, CY = (y) => y + TH_H / 2, CX = (x) => x + TH_W / 2;

function sectionOnboarding() {
  // positions
  const prov = [120, 560], plex = [760, 300], jurl = [760, 820], qc = [1440, 660], pw = [1440, 980];
  const home = [2680, 600], homeW = 360, homeH = 220;
  const spL = [760, 1320], chip = [120, 1330], chipW = 320, chipH = 150, spS = [760, 1580];
  const thumbs = [
    thumb('provider-picker', prov[0], prov[1], 'Provider picker'),
    thumb('plex-pairing', plex[0], plex[1], 'Plex pairing'),
    thumb('jf-login-url', jurl[0], jurl[1], 'Jellyfin login · server URL'),
    thumb('jf-login-quickconnect', qc[0], qc[1], 'Jellyfin · Quick Connect'),
    thumb('jf-login-password', pw[0], pw[1], 'Jellyfin · password'),
    thumb('server-picker-launch', spL[0], spL[1], 'Server picker (launch)'),
    thumb('server-picker-settings', spS[0], spS[1], 'Server picker (from Settings)'),
  ];
  const boxes = [
    box(home[0], home[1], homeW, homeH, 'HOME', '→ Profile / Who’s-watching →\n(collapsed tail)', true),
    box(chip[0], chip[1], chipW, chipH, 'Settings', 'Switch server · Forget server'),
  ];
  const lanes = [
    laneLabel(60, 235, 'FIRST RUN · no saved links'),
    laneLabel(60, 1270, 'RETURNING · ≥1 saved link'),
    laneLabel(60, 1530, 'MID-SESSION · Settings'),
  ];
  const a = [
    arrow(R(prov[0]), CY(prov[1]) - 30, plex[0], B(plex[1]) - 40, 'choose Plex'),
    arrow(R(prov[0]), CY(prov[1]) + 30, jurl[0], jurl[1] + 40, 'choose Jellyfin'),
    arrow(R(plex[0]), CY(plex[1]), home[0], home[1] + 60, 'signed in'),
    arrow(R(jurl[0]), CY(jurl[1]) - 20, qc[0], B(qc[1]) - 30, 'Quick Connect'),
    arrow(R(jurl[0]), CY(jurl[1]) + 20, pw[0], pw[1] + 30, 'use password'),
    arrow(R(qc[0]), CY(qc[1]), home[0], CY(home[1]) - 20, 'approved'),
    arrow(CX(qc[0]) + 60, B(qc[1]), CX(pw[0]) + 60, pw[1], 'use password'),
    arrow(R(pw[0]), CY(pw[1]), home[0], CY(home[1]) + 40, 'signed in'),
    arrow(CX(plex[0]) - 90, plex[1], CX(prov[0]) + 40, prov[1], 'Use a different service', { dashed: true, color: '#7f8488' }),
    arrow(R(spL[0]), CY(spL[1]) - 20, home[0] + 40, B(home[1]), 'select link'),
    arrow(spL[0], CY(spL[1]) + 20, CX(prov[0]), B(prov[1]), 'Add a new server', { dashed: true, color: '#7f8488' }),
    arrow(chip[0] + chipW, chip[1] + chipH / 2, spS[0], CY(spS[1]) - 20, 'Switch server'),
    arrow(R(spS[0]), CY(spS[1]), home[0] + 80, B(home[1]) + 10, 'select link'),
    arrow(CX(spS[0]) - 60, spS[1], chip[0] + chipW, chip[1] + chipH - 20, 'Back', { dashed: true, color: '#7f8488' }),
  ];
  const legend = `<div class="legend" style="left:2360px;top:1500px">` +
    `<b style="color:#A8C7FA">— solid</b> primary path · <b style="color:#7f8488">– – dashed</b> loop-back / escape<br>` +
    `Launch routing: <b>no saved links → Provider picker</b> · <b>≥1 saved link → Server picker</b><br>` +
    `Forget server: removes only the current link → Server picker (or Provider picker if none remain).` +
    `</div>`;
  composite('section-1-onboarding', 3340, 1900, {
    title: '§1 · Onboarding & Server Selection',
    sub: 'First-run, returning (saved links), and mid-session switch/forget — converging to Home.',
    lanes, boxes, thumbs, arrows: a, legend,
  });
}

const SECTIONS = { 'section-1': sectionOnboarding };

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args[0] === 'sections') {
  Object.values(SECTIONS).forEach((fn) => fn());
} else if (SECTIONS[args[0]]) {
  SECTIONS[args[0]]();
} else {
  const todo = args.length ? SCREENS.filter((s) => args.includes(s.name)) : SCREENS;
  if (!todo.length) { console.error('No matching screens:', args.join(', ')); process.exit(1); }
  for (const s of todo) shoot(s.name, page(s.cls, s.html, s.focus), 1920, 1080);
}

rmSync(TMP, { recursive: true, force: true });
console.log('done →', OUT);
