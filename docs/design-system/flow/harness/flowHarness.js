/**
 * Flow harness — single registry of every screen/state the flow-doc renders.
 *
 * Strategy: STATIC HTML with the real `src/styles/app.css` classes. Mounting the
 * real screen functions (homeScreen, etc.) in a headless browser is unreliable
 * (background timers + ultrablur image decode keep virtual-time alive forever).
 * For a flow diagram the goal is structural representativeness, not live mount,
 * so we mimic each screen's structure with the real CSS class names.
 *
 * URL: `index.html?screen=NAME` → window.renderScreen(NAME) → sets __harnessReady.
 */
import '../../../../src/styles/app.css';
import { plexMarkSvg, jellyfinMarkSvg, addServerGlyphSvg } from '../../../../src/ui/brand/providerMarks.js';
import { iconSvgForKind } from '../../../../src/ui/icons/navIcons.js';

// ── helpers ──────────────────────────────────────────────────────────────────
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function waitPaint() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

// ── Generic poster (gradient stand-in, real-app card structure) ──────────────
function posterGradient(seed) {
  const hue = (seed * 37) % 360;
  return `linear-gradient(135deg,hsl(${hue},42%,32%) 0%,hsl(${(hue + 38) % 360},48%,16%) 100%)`;
}
function posterCard(seed, title, progress, kind) {
  const isLandscape = kind === 'episode';
  const w = isLandscape ? 280 : 200;
  const h = isLandscape ? 158 : 300;
  const bar = progress != null
    ? `<div style="position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,0.16)"><div style="height:100%;width:${progress}%;background:#A8C7FA"></div></div>`
    : '';
  const caption = title
    ? `<div style="margin-top:8px;font-size:14px;color:#E3E3E3;line-height:1.3;max-width:${w}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</div>`
    : '';
  return `<div style="flex:0 0 auto;width:${w}px;margin-right:14px">` +
    `<div style="width:${w}px;height:${h}px;border-radius:8px;background:${posterGradient(seed)};position:relative;overflow:hidden;` +
    `display:flex;align-items:flex-end;justify-content:flex-start;padding:12px;color:rgba(255,255,255,0.16);font-size:42px;font-weight:800">` +
    `<span style="font-variant-numeric:tabular-nums">${(seed % 99).toString().padStart(2, '0')}</span>${bar}</div>${caption}</div>`;
}

function rail(label, cards) {
  return `<section style="margin-bottom:36px">` +
    `<h3 style="color:#E3E3E3;font-size:20px;font-weight:600;margin:0 0 14px;letter-spacing:-0.01em">${label}</h3>` +
    `<div style="display:flex;overflow:hidden;padding-right:60px">${cards}</div></section>`;
}

// ── App shell sidebar (mimics browsing-hub-nav, expanded state) ──────────────
function sidebar(activeId) {
  const mediaItems = [
    { id: 'home',         label: 'Home',     iconKind: 'home' },
    { id: 'watchlist',    label: 'Watchlist', iconKind: 'watchlist' },
    { id: 'library:1',    label: 'Films',    iconKind: 'movie' },
    { id: 'library:2',    label: 'TV Shows', iconKind: 'tv' },
    { id: 'library:3',    label: 'Kids',     iconKind: 'movie' },
  ];
  const sysItems = [
    { id: 'search',       label: 'Search',   iconKind: 'search' },
    { id: 'settings',     label: 'Settings', iconKind: 'settings' },
  ];
  function btn(item) {
    const isActive = item.id === activeId;
    const filled = item.iconKind === 'watchlist' && isActive;
    let iconHtml = '';
    try { iconHtml = iconSvgForKind(item.iconKind, filled); } catch (e) { iconHtml = '<span style="display:inline-block;width:24px;height:24px;background:currentColor;opacity:0.6;border-radius:4px"></span>'; }
    return `<button class="browsing-hub-item${isActive ? ' active' : ''}" data-hub-id="${item.id}"${isActive ? ' aria-current="page"' : ''} tabindex="0" style="display:flex;align-items:center;gap:14px;padding:14px 18px;border:none;background:transparent;color:${isActive ? '#A8C7FA' : 'rgba(227,227,227,0.78)'};font-size:16px;font-weight:${isActive ? '600' : '500'};border-radius:10px;width:100%;text-align:left${isActive ? ';background:rgba(168,199,250,0.12)' : ''}">` +
      `<span class="browsing-hub-item__icon" style="display:flex;width:24px;height:24px;align-items:center;justify-content:center">${iconHtml}</span>` +
      `<span class="browsing-hub-item__label" style="white-space:nowrap">${item.label}</span></button>`;
  }
  return `<nav class="browsing-hub-nav-host browsing-hub-nav-host--expanded" style="position:absolute;left:0;top:0;bottom:0;width:240px;padding:32px 16px;background:linear-gradient(to right,#131314 0%,#131314 82%,rgba(19,19,20,0) 100%);z-index:5;display:flex;flex-direction:column">` +
    `<div style="padding:8px 18px 28px;color:#A8C7FA;font-size:22px;font-weight:700;letter-spacing:-0.02em">XPlay</div>` +
    `<div style="display:flex;flex-direction:column;gap:4px">${mediaItems.map(btn).join('')}</div>` +
    `<div style="flex:1"></div>` +
    `<div style="display:flex;flex-direction:column;gap:4px">${sysItems.map(btn).join('')}</div>` +
    `</nav>`;
}

// ── Specific screen builders ─────────────────────────────────────────────────
function staticHome(empty) {
  const rails = empty ? '' :
    rail('Continue Watching', Array.from({ length: 7 }).map((_, i) => posterCard(i + 1, '', 20 + i * 12)).join('')) +
    rail('Trending Now',      Array.from({ length: 8 }).map((_, i) => posterCard(i + 20)).join('')) +
    rail('New Releases',      Array.from({ length: 8 }).map((_, i) => posterCard(i + 40)).join(''));
  const emptyMsg = empty ? `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:120px 40px;color:rgba(227,227,227,0.62);text-align:center"><h2 style="font-size:28px;font-weight:600;color:#E3E3E3;margin:0 0 12px">Nothing here yet</h2><p style="font-size:16px;margin:0">Add a library or sign in with a server that has content.</p></div>` : '';
  return `<div class="screen screen-home" style="position:relative;background:#131314;min-height:1080px">` +
    sidebar('home') +
    `<div class="home-main" style="margin-left:240px;padding:0">` +
    // hero
    (empty ? '' : `<div class="il-hero" style="height:540px;position:relative;background:` +
      `linear-gradient(90deg,rgba(19,19,20,0.96) 0%,rgba(19,19,20,0.78) 30%,rgba(19,19,20,0) 65%),` +
      `linear-gradient(135deg,hsl(218,52%,32%) 0%,hsl(258,48%,16%) 100%);">` +
      `<div class="il-hero__content" style="padding:96px 64px;max-width:680px">` +
      `<p style="color:#A8C7FA;font-size:14px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 12px">FEATURED · MOVIE</p>` +
      `<h2 style="color:#fff;font-size:64px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px;line-height:1.05">Northwind</h2>` +
      `<p style="color:rgba(255,255,255,0.7);font-size:16px;margin:0 0 18px">2024 · 2h 14m · PG-13 · ★ 8.2</p>` +
      `<p style="color:rgba(255,255,255,0.86);font-size:18px;line-height:1.5;margin:0 0 28px">A sweeping, character-driven story that unfolds across one unforgettable season — tense, tender, and quietly epic.</p>` +
      `<div style="display:flex;gap:12px"><button class="btn btn-primary" tabindex="0" style="padding:16px 28px;font-size:16px;font-weight:600">▶ Play</button><button class="btn" tabindex="0" style="padding:16px 28px;font-size:16px">More info</button></div>` +
      `</div></div>`) +
    `<div class="home-feed-host" style="padding:${empty ? '0' : '0 0 0 64px'};margin-top:${empty ? '0' : '-120px'};position:relative;z-index:2">${rails}${emptyMsg}</div>` +
    `</div></div>`;
}

function staticLibrary(filter) {
  const cards = Array.from({ length: 24 }).map((_, i) => posterCard(i + 100, '')).join('');
  const filterPanel = filter ? `<div class="side-panel side-panel--open" style="position:fixed;right:0;top:0;bottom:0;width:420px;background:rgba(20,22,26,0.96);backdrop-filter:blur(8px);padding:56px 36px;z-index:10"><h2 style="color:#fff;font-size:26px;font-weight:600;margin:0 0 28px">Filter</h2><ul style="list-style:none;padding:0;margin:0">${['All items','Unwatched only','In progress','Recently added'].map((t,i)=>`<li tabindex="0" style="padding:16px 22px;border-radius:10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;font-size:18px;${i===1?'background:rgba(168,199,250,0.14);color:#A8C7FA':'color:rgba(255,255,255,0.82)'}">${t}${i===1?'<span>✓</span>':''}</li>`).join('')}</ul></div>` : '';
  return `<div class="screen library-screen" style="position:relative;background:#131314;min-height:1080px">` +
    sidebar('library:1') +
    `<div style="margin-left:240px;padding:48px 64px">` +
    `<header style="display:flex;align-items:center;gap:24px;margin-bottom:32px"><h1 style="color:#fff;font-size:42px;font-weight:700;margin:0;letter-spacing:-0.02em">Films</h1><div style="flex:1"></div>` +
    `<button class="btn" tabindex="0">Filter</button><button class="btn" tabindex="0">Sort: Title</button><button class="btn" tabindex="0">Scan</button></header>` +
    `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:18px 24px">${cards.replace(/margin-right:14px/g, '').replace(/flex:0 0 auto;width:200px/g, '')}</div>` +
    `</div>${filterPanel}</div>`;
}

function staticSearch(empty) {
  const results = empty ? '' :
    rail('Movies',   Array.from({ length: 7 }).map((_, i) => posterCard(i + 200)).join('')) +
    rail('TV Shows', Array.from({ length: 6 }).map((_, i) => posterCard(i + 220)).join('')) +
    rail('Episodes', Array.from({ length: 5 }).map((_, i) => posterCard(i + 240, '', null, 'episode')).join(''));
  const noResults = empty ? `<div style="padding:80px 0;color:rgba(227,227,227,0.62);text-align:center;font-size:18px">No results yet — type to search your libraries</div>` : '';
  return `<div class="screen search-screen" style="position:relative;background:#131314;min-height:1080px">` +
    sidebar('search') +
    `<div style="margin-left:240px;padding:48px 64px">` +
    `<header style="margin-bottom:32px">` +
    `<input class="tv-text-input" type="text" value="${empty ? '' : 'north'}" placeholder="Search films, shows, episodes…" style="width:100%;max-width:720px;padding:18px 22px;font-size:22px;background:#303030;border:2px solid ${empty ? '#8E918F' : '#A8C7FA'};border-radius:8px;color:#E3E3E3;box-sizing:border-box"></header>` +
    results + noResults +
    `</div></div>`;
}

function staticWatchlist() {
  const rows = ['Weekend Picks', 'Saved for Later', 'Family Movie Night'].map((title) =>
    `<section style="margin-bottom:42px"><h3 style="color:#E3E3E3;font-size:22px;font-weight:600;margin:0 0 14px">${title}</h3>` +
    `<div style="display:flex;overflow:hidden;padding-right:60px">${Array.from({ length: 7 }).map((_, i) => posterCard(i + 300 + Math.random() * 50)).join('')}</div></section>`
  ).join('');
  return `<div class="screen watchlist-screen" style="position:relative;background:#131314;min-height:1080px">` +
    sidebar('watchlist') +
    `<div style="margin-left:240px;padding:48px 64px">` +
    `<h1 style="color:#fff;font-size:42px;font-weight:700;margin:0 0 32px;letter-spacing:-0.02em">Watchlist</h1>` +
    rows +
    `</div></div>`;
}

function staticSettings() {
  function card(title, rows) {
    return `<section style="background:rgba(255,255,255,0.04);border-radius:14px;padding:28px 32px;margin-bottom:18px;max-width:780px">` +
      `<h3 style="color:#A8C7FA;font-size:14px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 18px">${title}</h3>` +
      rows.map((r) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.06)"><div><div style="color:#E3E3E3;font-size:17px;font-weight:500">${r.label}</div>${r.sub ? `<div style="color:rgba(227,227,227,0.55);font-size:13px;margin-top:2px">${r.sub}</div>` : ''}</div><div style="color:rgba(227,227,227,0.62);font-size:15px">${r.value || ''}</div></div>`).join('') +
      `</section>`;
  }
  return `<div class="screen settings-screen" style="background:#131314;min-height:1080px;padding:64px 96px">` +
    `<h1 style="color:#fff;font-size:42px;font-weight:700;margin:0 0 36px;letter-spacing:-0.02em">Settings</h1>` +
    card('Account', [
      { label: 'Signed in as',  value: 'Alec · Plex' },
      { label: 'Active server', value: "alec's Plex (Living Room)" },
      { label: 'Switch server', value: '›' },
      { label: 'Forget server', value: '›' },
    ]) +
    card('Playback', [
      { label: 'Direct play when possible', sub: 'Skip transcoding for compatible media', value: 'On' },
      { label: 'Default audio',              value: 'Original' },
      { label: 'Default subtitles',          value: 'Off' },
      { label: 'Skip intro automatically',   value: 'On' },
      { label: 'Quality preset',             value: 'Auto' },
    ]) +
    card('Network', [
      { label: 'Log sink URL', sub: 'Stream debug logs to a remote receiver', value: 'Not set' },
      { label: 'Debug logging', value: 'Off' },
    ]) +
    card('About', [
      { label: 'Version',     value: '0.1.0' },
      { label: 'Device',      value: 'Alec-TV · webOS 4.0' },
      { label: 'Build date',  value: '2026-06-27' },
    ]) +
    `</div>`;
}

// ── Detail screens (movie/show/season/episode) ────────────────────────────────
function staticDetail(kind) {
  const isEpisode = kind === 'episode';
  const breadcrumb = kind === 'season' ? 'TV Shows › The Long Field' : kind === 'episode' ? 'TV Shows › The Long Field › Season 2' : 'Films';
  const title = kind === 'show' ? 'The Long Field' : kind === 'season' ? 'Season 2' : kind === 'episode' ? 'The Tide Returns' : 'Northwind';
  const subtitle = kind === 'show' ? '3 Seasons · 24 Episodes · 2022–2024' : kind === 'season' ? 'The Long Field · 8 episodes' : kind === 'episode' ? 'S02 · E05 · 52 min' : '2024 · 2h 14m · PG-13 · ★ 8.2';
  const heroBg = `linear-gradient(90deg,rgba(19,19,20,0.94) 0%,rgba(19,19,20,0.72) 40%,rgba(19,19,20,0) 70%),linear-gradient(135deg,hsl(${(kind.length * 47) % 360},48%,28%),hsl(${(kind.length * 47 + 40) % 360},48%,12%))`;
  const subRail = isEpisode
    ? rail('Up Next', Array.from({ length: 5 }).map((_, i) => posterCard(i + 600 + Math.random() * 30, `Episode ${i + 6}`, null, 'episode')).join(''))
    : kind === 'show'
      ? `<section style="margin-bottom:42px"><h3 style="color:#E3E3E3;font-size:22px;font-weight:600;margin:0 0 14px">Seasons</h3><div style="display:flex;gap:14px">${[1, 2, 3].map((n) => `<button class="btn${n === 2 ? ' btn-primary' : ''}" tabindex="0">Season ${n}</button>`).join('')}</div></section>` +
        rail('Cast', Array.from({ length: 6 }).map((_, i) => `<div style="flex:0 0 auto;width:140px;margin-right:14px;text-align:center"><div style="width:120px;height:120px;border-radius:50%;background:${posterGradient(i + 700)};margin:0 auto"></div><div style="color:#E3E3E3;font-size:14px;margin-top:10px">Mara Vance</div><div style="color:rgba(227,227,227,0.55);font-size:12px">Mara Vance</div></div>`).join(''))
      : kind === 'season'
        ? rail('Episodes', Array.from({ length: 7 }).map((_, i) => posterCard(i + 800 + Math.random() * 20, `S2 · E${i + 1}`, null, 'episode')).join(''))
        : rail('Cast', Array.from({ length: 6 }).map((_, i) => `<div style="flex:0 0 auto;width:140px;margin-right:14px;text-align:center"><div style="width:120px;height:120px;border-radius:50%;background:${posterGradient(i + 900)};margin:0 auto"></div><div style="color:#E3E3E3;font-size:14px;margin-top:10px">Mara Vance</div><div style="color:rgba(227,227,227,0.55);font-size:12px">Mara Vance</div></div>`).join('')) +
          rail('More Like This', Array.from({ length: 7 }).map((_, i) => posterCard(i + 950)).join(''));
  return `<div class="screen detail-screen" style="position:relative;background:#131314;min-height:1080px">` +
    sidebar('library:' + (kind === 'movie' ? '1' : '2')) +
    `<div style="margin-left:240px">` +
    `<div class="detail-hero" style="height:560px;position:relative;background:${heroBg};padding:80px 64px">` +
    `<p style="color:rgba(227,227,227,0.72);font-size:14px;letter-spacing:0.04em;margin:0 0 10px">${breadcrumb}</p>` +
    `<h1 style="color:#fff;font-size:${isEpisode ? '48px' : '64px'};font-weight:700;letter-spacing:-0.02em;margin:0 0 12px;line-height:1.05">${title}</h1>` +
    `<p style="color:rgba(255,255,255,0.78);font-size:18px;margin:0 0 16px">${subtitle}</p>` +
    `<p style="color:rgba(255,255,255,0.86);font-size:17px;max-width:680px;line-height:1.55;margin:0 0 28px">A sweeping, character-driven story that unfolds across one unforgettable season — tense, tender, and quietly epic.</p>` +
    `<div style="display:flex;gap:12px;align-items:center"><button class="btn btn-primary" tabindex="0" style="padding:16px 32px;font-size:17px;font-weight:600">▶ Play</button><button class="btn" tabindex="0">Mark watched</button><button class="btn btn-icon" tabindex="0">🔖</button><button class="btn btn-icon" tabindex="0">⋯</button></div>` +
    `</div>` +
    `<div style="padding:48px 64px">${subRail}</div>` +
    `</div></div>`;
}

function staticDetailLoading() {
  return `<div class="screen detail-screen" style="position:relative;background:#131314;min-height:1080px">` +
    sidebar('library:1') +
    `<div style="margin-left:240px;display:flex;align-items:center;justify-content:center;height:1080px">` +
    `<div style="display:flex;flex-direction:column;align-items:center;gap:20px">` +
    `<div style="width:56px;height:56px;border:6px solid rgba(255,255,255,0.16);border-top-color:#A8C7FA;border-radius:50%;animation:spin 1s linear infinite"></div>` +
    `<p style="color:rgba(227,227,227,0.62);font-size:16px;margin:0">Loading…</p>` +
    `<style>@keyframes spin{to{transform:rotate(360deg)}}</style></div></div></div>`;
}

// ── Onboarding (existing) ────────────────────────────────────────────────────
const PLEX_LOGO =
  '<svg class="provider-card__logo" viewBox="0 0 220 64" xmlns="http://www.w3.org/2000/svg" aria-label="Plex">' +
  '<path d="M20 8 L44 32 L20 56 L33 56 L57 32 L33 8 Z" fill="#E5A00D"/>' +
  '<text x="74" y="46" font-family="Arial,sans-serif" font-size="40" font-weight="800" letter-spacing="2" fill="#E5A00D">PLEX</text></svg>';
const JF_LOGO =
  '<svg class="provider-card__logo" viewBox="0 0 250 64" xmlns="http://www.w3.org/2000/svg" aria-label="Jellyfin">' +
  '<defs><linearGradient id="jfg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#AA5CC3"/><stop offset="1" stop-color="#00A4DC"/></linearGradient></defs>' +
  '<path d="M32 8c-6 9-16 25-16 31 0 5.3 7.2 9 16 9s16-3.7 16-9c0-6-10-22-16-31z" fill="url(#jfg)" opacity="0.5"/>' +
  '<path d="M32 22c-3.4 5.4-9 14.5-9 17.6 0 2.9 4 5.2 9 5.2s9-2.3 9-5.2c0-3.1-5.6-12.2-9-17.6z" fill="url(#jfg)"/>' +
  '<text x="72" y="44" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#F2F2F7">Jellyfin</text></svg>';
const QR_BLOCK = (() => {
  const rects = [];
  for (let i = 0; i < 80; i++) rects.push(`<rect x="${Math.floor(Math.random() * 29)}" y="${Math.floor(Math.random() * 29)}" width="1" height="1" fill="#111"/>`);
  return `<svg width="220" height="220" viewBox="0 0 29 29" xmlns="http://www.w3.org/2000/svg" style="background:#fff;border-radius:8px">${rects.join('')}<rect x="1" y="1" width="7" height="7" fill="none" stroke="#111"/><rect x="21" y="1" width="7" height="7" fill="none" stroke="#111"/><rect x="1" y="21" width="7" height="7" fill="none" stroke="#111"/></svg>`;
})();

function providerCard(brand, desc) {
  const logo = brand === 'plex' ? PLEX_LOGO : JF_LOGO;
  return `<button class="provider-card card" data-brand="${brand}" tabindex="0">` +
    `<span class="provider-card__media">${logo}</span><span class="provider-card__desc">${desc}</span></button>`;
}
function savedServerCard(brand, caption) {
  const logo = brand === 'plex' ? plexMarkSvg({ className: 'server-card__logo' }) : jellyfinMarkSvg({ className: 'server-card__logo' });
  return `<button class="server-card" data-brand="${brand}" tabindex="0">` +
    `<span class="server-card__media">${logo}</span><span class="server-card__label">${caption}</span></button>`;
}
const addServerCard =
  `<button class="server-card server-card--add" tabindex="0">` +
  `<span class="server-card__media">${addServerGlyphSvg({ className: 'server-card__glyph' })}</span>` +
  `<span class="server-card__label">Add a new server</span></button>`;

const staticHTML = (cls, inner, focusSel) => (root) => {
  const w = el('div', 'screen ' + cls, inner);
  root.appendChild(w);
  if (focusSel) { const f = w.querySelector(focusSel); if (f && f.focus) f.focus(); }
};

// ── Player chrome states ─────────────────────────────────────────────────────
function renderPlayerHTML(s) {
  const backdrop =
    `<div style="position:absolute;inset:0;background:` +
    `radial-gradient(60% 80% at 30% 35%,hsla(218,42%,28%,0.7) 0%,hsl(218,38%,8%) 65%),` +
    `linear-gradient(180deg,#0a0a0c 0%,#1c1f24 100%)"></div>`;
  const spinner = s.spinner ? `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:64px;height:64px;border:6px solid rgba(255,255,255,0.18);border-top-color:#A8C7FA;border-radius:50%;animation:pspin 1s linear infinite"></div><style>@keyframes pspin{to{transform:translate(-50%,-50%) rotate(360deg)}}</style>` : '';
  const transport = s.transport ? `
    <div style="position:absolute;inset:auto 0 0 0;padding:48px 64px 56px;background:linear-gradient(180deg,transparent,rgba(0,0,0,0.86) 60%)">
      <div style="margin-bottom:18px">
        <p style="color:#A8C7FA;font-size:14px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px">S02 · E05</p>
        <h2 style="color:#fff;font-size:32px;font-weight:700;margin:0">The Tide Returns</h2>
        <p style="color:rgba(255,255,255,0.62);font-size:15px;margin:6px 0 0">The Long Field · 52 min</p>
      </div>
      <div style="display:flex;align-items:center;gap:18px">
        <span style="color:rgba(255,255,255,0.7);font-size:14px;min-width:48px">${s.scrub ? '12:47' : '08:14'}</span>
        <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.16);position:relative">
          <div style="height:100%;width:${s.scrub ? '24' : '16'}%;background:#A8C7FA;border-radius:3px"></div>
          <div style="position:absolute;left:${s.scrub ? '24' : '16'}%;top:50%;transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:#fff${s.scrub ? ';box-shadow:0 0 0 6px rgba(168,199,250,0.22)' : ''}"></div>
        </div>
        <span style="color:rgba(255,255,255,0.7);font-size:14px;min-width:48px;text-align:right">52:00</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-top:32px">
        <button class="btn btn-icon" tabindex="0" style="width:56px;height:56px;border-radius:50%">⤺ 10</button>
        <button class="btn btn-primary" tabindex="0" style="width:80px;height:80px;border-radius:50%;font-size:28px">${s.paused ? '▶' : '❚❚'}</button>
        <button class="btn btn-icon" tabindex="0" style="width:56px;height:56px;border-radius:50%">10 ⤻</button>
        <span style="flex:1"></span>
        <button class="btn" tabindex="0">Subtitles</button>
        <button class="btn" tabindex="0">Audio</button>
        <button class="btn" tabindex="0">Quality</button>
      </div>
    </div>` : '';
  const drawer = s.drawer ? `
    <div style="position:absolute;right:0;top:0;bottom:0;width:420px;background:rgba(20,22,26,0.94);padding:48px 32px;color:#fff">
      <h2 style="font-size:24px;font-weight:600;margin:0 0 24px">${s.drawer === 'subtitles' ? 'Subtitles' : 'Audio'}</h2>
      <ul style="list-style:none;padding:0;margin:0">
        ${['Off', 'English', 'English (SDH)', 'Spanish'].map((t, i) =>
          `<li tabindex="0" style="padding:14px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;${i === 1 ? 'background:rgba(168,199,250,0.12);color:#A8C7FA' : 'color:rgba(255,255,255,0.8)'}">${t}${i === 1 ? '<span>✓</span>' : ''}</li>`).join('')}
      </ul>
    </div>` : '';
  const prompt = s.prompt === 'skip' ? `
    <div style="position:absolute;right:64px;bottom:280px;padding:20px 28px;background:rgba(20,22,26,0.92);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.45)">
      <p style="color:#fff;font-size:16px;margin:0 0 12px">Intro detected</p>
      <button class="btn btn-primary" tabindex="0">Skip Intro</button>
    </div>` : s.prompt === 'upnext' ? `
    <div style="position:absolute;right:64px;bottom:64px;width:380px;padding:20px;background:rgba(20,22,26,0.94);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.45);display:flex;gap:18px">
      <div style="width:120px;height:68px;border-radius:6px;background:linear-gradient(135deg,hsl(258,42%,32%),hsl(296,48%,16%))"></div>
      <div style="flex:1">
        <p style="color:rgba(255,255,255,0.62);font-size:12px;margin:0">UP NEXT · in 12s</p>
        <p style="color:#fff;font-size:15px;font-weight:600;margin:4px 0 8px">S02 · E06 · The Reckoning</p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn--sm" tabindex="0">Play next</button>
          <button class="btn btn--sm" tabindex="0">Browse</button>
        </div>
      </div>
    </div>` : s.prompt === 'error' ? `
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;color:#fff">
      <h2 style="font-size:32px;font-weight:600;margin:0 0 12px">Playback failed</h2>
      <p style="color:rgba(255,255,255,0.62);font-size:16px;margin:0 0 24px">The server stopped responding mid-stream.</p>
      <div style="display:flex;gap:12px;justify-content:center"><button class="btn btn-primary" tabindex="0">Retry</button><button class="btn" tabindex="0">Back</button></div>
    </div>` : '';
  return `<div style="position:absolute;inset:0;background:#0a0a0c">${backdrop}${spinner}${transport}${drawer}${prompt}</div>`;
}

function buildPlayerStates() {
  const map = {
    'player-loading':      { transport: false, spinner: true,  paused: false, scrub: false, drawer: null,        prompt: null },
    'player-playing':      { transport: true,  spinner: false, paused: false, scrub: false, drawer: null,        prompt: null },
    'player-paused':       { transport: true,  spinner: false, paused: true,  scrub: false, drawer: null,        prompt: null },
    'player-seeking':      { transport: true,  spinner: false, paused: false, scrub: true,  drawer: null,        prompt: null },
    'player-track-drawer': { transport: true,  spinner: false, paused: false, scrub: false, drawer: 'subtitles', prompt: null },
    'player-skip-intro':   { transport: true,  spinner: false, paused: false, scrub: false, drawer: null,        prompt: 'skip' },
    'player-up-next':      { transport: true,  spinner: false, paused: false, scrub: false, drawer: null,        prompt: 'upnext' },
    'player-error':        { transport: false, spinner: false, paused: false, scrub: false, drawer: null,        prompt: 'error' },
  };
  const out = {};
  Object.keys(map).forEach((k) => { out[k] = { mount: staticHTML('player-screen', renderPlayerHTML(map[k])) }; });
  return out;
}

// ── Modal builders ───────────────────────────────────────────────────────────
function modalOver(content) {
  return `<div class="screen home-screen" style="position:absolute;inset:0;background:linear-gradient(135deg,#1a1d24,#0a0c10)"></div>` +
    `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:20">${content}</div>`;
}
function renderTextInputModalHTML() {
  return modalOver(`<div style="width:640px;background:#1f2126;border-radius:16px;padding:32px;box-shadow:0 24px 64px rgba(0,0,0,0.6)">
    <h2 style="color:#fff;font-size:24px;font-weight:600;margin:0 0 16px">Server address</h2>
    <input type="text" class="tv-text-input" value="http://192.168.1.10:8096" style="width:100%;padding:14px 18px;font-size:24px;background:#303030;border:2px solid #A8C7FA;border-radius:8px;color:#E3E3E3;box-sizing:border-box" />
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:24px">
      <button class="btn" tabindex="0">Cancel</button>
      <button class="btn btn-primary" tabindex="0">Confirm</button>
    </div></div>`);
}
function renderActionDialogHTML() {
  return modalOver(`<div style="width:520px;background:#1f2126;border-radius:16px;padding:32px;box-shadow:0 24px 64px rgba(0,0,0,0.6)">
    <h2 style="color:#fff;font-size:22px;font-weight:600;margin:0 0 12px">Delete this watchlist?</h2>
    <p style="color:rgba(255,255,255,0.62);font-size:15px;margin:0 0 24px">"Weekend Picks" will be removed. This can't be undone.</p>
    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn" tabindex="0">Cancel</button>
      <button class="btn btn-danger" tabindex="0" style="background:#c53030;color:#fff">Delete</button>
    </div></div>`);
}
function renderSidePanelHTML(title, options, selectedIdx) {
  return `<div class="screen" style="background:linear-gradient(135deg,#1a1d24,#0a0c10);min-height:1080px"></div>` +
    `<div style="position:fixed;right:0;top:0;bottom:0;width:480px;background:rgba(20,22,26,0.96);backdrop-filter:blur(8px);padding:56px 36px;z-index:20">
      <h2 style="color:#fff;font-size:26px;font-weight:600;margin:0 0 28px">${title}</h2>
      <ul style="list-style:none;padding:0;margin:0">
        ${options.map((t, i) => `<li tabindex="0" style="padding:18px 22px;border-radius:10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;font-size:18px;${i === selectedIdx ? 'background:rgba(168,199,250,0.14);color:#A8C7FA' : 'color:rgba(255,255,255,0.82)'}">${t}${i === selectedIdx ? '<span style="font-size:22px">✓</span>' : ''}</li>`).join('')}
      </ul></div>`;
}

// ── screen registry ──────────────────────────────────────────────────────────
const screens = {
  // §1 Onboarding
  'provider-picker':         { mount: staticHTML('screen-center provider-picker',
    `<h1 class="screen-title">Choose your media server</h1><p class="screen-subtitle">XPlay works with Plex or Jellyfin. Pick the one you use — you can switch later.</p><div class="provider-cards">${providerCard('plex', 'Sign in with your plex.tv account')}${providerCard('jellyfin', 'Connect to your Jellyfin server')}</div>`,
    '.provider-card[data-brand="plex"]') },
  'plex-pairing':            { mount: staticHTML('screen-center pairing-screen',
    `<h1 class="screen-title">Sign in to Plex</h1><p class="screen-subtitle">Visit <strong>plex.tv/link</strong> and enter this code, or scan the QR</p><div class="pairing-layout pairing-layout-centered"><div class="pairing-qr">${QR_BLOCK}</div><div class="pairing-code-block"><p class="pairing-code">QKF8</p><p class="status-msg">Waiting for sign-in…</p><div class="pairing-actions"><button class="btn" tabindex="0">Refresh code</button><button class="btn login-switch-provider" tabindex="0">Use a different service</button></div></div></div>`) },
  'jf-login-url':            { mount: staticHTML('screen-center jellyfin-login',
    `<h1 class="screen-title">Connect to Jellyfin</h1><p class="screen-subtitle">Enter your Jellyfin server address to begin.</p><div class="login-fields"><div class="login-field"><span class="login-field__label">Server address</span><button class="btn login-field__btn" tabindex="0">http://192.168.1.10:8096</button></div></div><div class="login-actions"><button class="btn btn-primary" tabindex="0">Connect</button></div><button class="btn login-switch-provider" tabindex="0">Use a different service</button>`) },
  'jf-login-quickconnect':   { mount: staticHTML('screen-center jellyfin-login',
    `<h1 class="screen-title">Connect to Jellyfin</h1><p class="screen-subtitle">Connected to LivingRoom. On another device, open Jellyfin → <strong>Quick Connect</strong> and enter this code:</p><p class="pairing-code">734 912</p><p class="status-msg">Waiting for approval…</p><div class="login-actions"><button class="btn" tabindex="0">Use username &amp; password</button></div><button class="btn login-switch-provider" tabindex="0">Use a different service</button>`) },
  'jf-login-password':       { mount: staticHTML('screen-center jellyfin-login',
    `<h1 class="screen-title">Connect to Jellyfin</h1><p class="screen-subtitle">Connected to LivingRoom.</p><div class="login-fields"><div class="login-field"><span class="login-field__label">Username</span><button class="btn login-field__btn" tabindex="0">alec</button></div><div class="login-field"><span class="login-field__label">Password</span><button class="btn login-field__btn" tabindex="0">••••••••</button></div></div><div class="login-actions"><button class="btn btn-primary" tabindex="0">Sign in</button></div><button class="btn login-switch-provider" tabindex="0">Use a different service</button>`) },
  'profile-picker':          { mount: staticHTML('screen-center profile-picker-screen',
    `<h1 class="screen-title">Who's watching?</h1><div class="profile-grid">${['Alec', 'Sam', 'Jess', 'Kids'].map((n, i) => { const hue = [218, 158, 28, 348][i]; const lock = i === 3 ? '<span class="profile-card__lock" aria-label="PIN required">🔒</span>' : ''; return `<button class="profile-card" tabindex="0"><span class="profile-card__avatar" style="background:hsl(${hue},55%,42%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:48px;font-weight:600">${n[0]}</span>${lock}<span class="profile-card__name">${n}</span></button>`; }).join('')}</div>`,
    '.profile-card') },
  'profile-picker-pin':      { mount: staticHTML('screen-center profile-picker-screen',
    `<h1 class="screen-title">Enter PIN for Kids</h1><p class="screen-subtitle">4-digit profile PIN</p><div class="pin-display" style="display:flex;justify-content:center;gap:16px;margin:28px 0 36px">${[1, 1, 0, 0].map((f) => `<span style="width:18px;height:18px;border-radius:50%;background:${f ? '#A8C7FA' : 'rgba(227,227,227,0.18)'}"></span>`).join('')}</div><div class="pin-pad-grid" style="display:grid;grid-template-columns:repeat(3,90px);gap:14px;justify-content:center">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d) => d ? `<button class="btn pin-pad-key" tabindex="0" style="width:90px;height:90px;font-size:28px">${d}</button>` : `<span></span>`).join('')}</div>`,
    '.pin-pad-key') },
  'jf-user-picker':          { mount: staticHTML('screen-center jellyfin-user-picker',
    `<h1 class="screen-title">Who's watching?</h1><p class="screen-subtitle">Pick your Jellyfin profile, or sign in as someone else.</p><div class="profile-grid">${['Alec', 'Sam', 'Guests'].map((n, i) => { const hue = [218, 280, 198][i]; return `<button class="profile-card" tabindex="0"><span class="profile-card__avatar" style="background:hsl(${hue},45%,40%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:48px;font-weight:600">${n[0]}</span><span class="profile-card__name">${n}</span></button>`; }).join('')}<button class="profile-card profile-card--add" tabindex="0"><span class="profile-card__avatar profile-card__avatar--add" style="display:flex;align-items:center;justify-content:center;font-size:36px;color:#A8C7FA;background:rgba(168,199,250,0.08);border:2px dashed rgba(168,199,250,0.4)">＋</span><span class="profile-card__name">Other user</span></button></div>`,
    '.profile-card') },
  'server-picker-launch':    { mount: staticHTML('screen-center server-picker-screen',
    `<h1 class="screen-title">Choose a server</h1><p class="screen-subtitle">Pick a saved server or add a new one.</p><div class="server-card-grid">${savedServerCard('jellyfin', 'http://192.168.1.10:8096')}${savedServerCard('plex', "alec's Plex")}${addServerCard}</div>`,
    '.server-card') },
  'server-picker-settings':  { mount: staticHTML('screen-center server-picker-screen',
    `<h1 class="screen-title">Choose a server</h1><p class="screen-subtitle">Pick a saved server or add a new one. Your saved servers stay linked.</p><div class="server-card-grid">${savedServerCard('jellyfin', 'http://192.168.1.10:8096')}${savedServerCard('plex', "alec's Plex")}${addServerCard}</div><button class="btn server-picker-back" tabindex="0">Back</button>`,
    '.server-card') },

  // §2 Browsing Hub
  'home':           { mount: (root) => { root.innerHTML = staticHome(false); } },
  'home-empty':     { mount: (root) => { root.innerHTML = staticHome(true); } },
  'library':        { mount: (root) => { root.innerHTML = staticLibrary(false); } },
  'library-filter': { mount: (root) => { root.innerHTML = staticLibrary(true); } },
  'search':         { mount: (root) => { root.innerHTML = staticSearch(false); } },
  'search-empty':   { mount: (root) => { root.innerHTML = staticSearch(true); } },
  'watchlist':      { mount: (root) => { root.innerHTML = staticWatchlist(); } },
  'settings':       { mount: (root) => { root.innerHTML = staticSettings(); } },

  // §3 Detail
  'detail-movie':   { mount: (root) => { root.innerHTML = staticDetail('movie'); } },
  'detail-show':    { mount: (root) => { root.innerHTML = staticDetail('show'); } },
  'detail-season':  { mount: (root) => { root.innerHTML = staticDetail('season'); } },
  'detail-episode': { mount: (root) => { root.innerHTML = staticDetail('episode'); } },
  'detail-loading': { mount: (root) => { root.innerHTML = staticDetailLoading(); } },

  // §4 Player
  ...buildPlayerStates(),

  // §5 Modals
  'modal-text-input':    { mount: staticHTML('', renderTextInputModalHTML()) },
  'modal-action-dialog': { mount: staticHTML('', renderActionDialogHTML()) },
  'side-panel-quality':  { mount: staticHTML('', renderSidePanelHTML('Quality', ['Auto', 'Original', '8 Mbps · 1080p', '4 Mbps · 720p', '2 Mbps · 480p'], 1)) },
  'side-panel-subtitles':{ mount: staticHTML('', renderSidePanelHTML('Subtitles', ['Off', 'English', 'English (SDH)', 'Spanish', 'French'], 1)) },
};

// ── public entry ─────────────────────────────────────────────────────────────
window.renderScreen = async function (name) {
  window.__harnessReady = false;
  const root = document.getElementById('root');
  root.innerHTML = '';
  const def = screens[name];
  if (!def) { root.textContent = 'unknown screen: ' + name; window.__harnessReady = true; return; }
  try {
    def.mount(root);
    await waitPaint();
    window.__harnessReady = true;
  } catch (e) {
    root.innerHTML = `<pre style="color:#f88;padding:40px">${e && e.stack || e}</pre>`;
    window.__harnessReady = true;
  }
};
window.SCREEN_NAMES = Object.keys(screens);
window.__harnessReady = true;
