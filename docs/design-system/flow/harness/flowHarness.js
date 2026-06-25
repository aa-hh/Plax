/**
 * Flow harness entry — boots the REAL screens with mock fixtures so the flow
 * renderer can screenshot pixel-accurate screens. `index.html?screen=NAME`
 * calls window.renderScreen(NAME). Backend calls are mocked via the harness
 * rollup plugin (src/backends/index.js → mockBackend.js).
 */
import '../../../../src/styles/app.css';
import { setState } from '../../../../src/core/store.js';
import { setScenario } from './mockBackend.js';
import { FIX } from './fixtures.js';
import { homeScreen } from '../../../../src/ui/screens/homeScreen.js';
import { libraryScreen } from '../../../../src/ui/screens/libraryScreen.js';
import { searchScreen } from '../../../../src/ui/screens/searchScreen.js';
import { settingsScreen } from '../../../../src/ui/screens/settingsScreen.js';
import { detailScreen } from '../../../../src/ui/screens/detailScreen.js';

function base() {
  setState({
    provider: 'plex', clientId: 'plax-demo', authToken: 't', ownerAuthToken: 't',
    user: FIX.user, activeHomeUser: FIX.user, servers: [FIX.server], activeServer: FIX.server,
    libraries: FIX.libraries, activeLibrary: FIX.libraries[0],
    networkPrefs: {}, playbackPrefs: {},
  });
}

const nav = function () {};
const screens = {
  home: (root) => homeScreen(root, {}, nav),
  library: (root) => libraryScreen(root, { libraryId: '1' }, nav),
  search: (root) => {
    const inst = searchScreen(root, {}, nav);
    const inp = root.querySelector('input, [contenteditable], .search-input, [data-search-input]');
    if (inp) {
      try { inp.value = 'north'; } catch (e) {}
      inp.textContent = 'north';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, keyCode: 78 }));
    }
    return inst;
  },
  settings: (root) => settingsScreen(root, { _from: 'home' }, nav),
  'detail-movie': (root) => detailScreen(root, { ratingKey: '5001', libraryType: 'movie', libraryId: '1' }, nav),
  'detail-show': (root) => detailScreen(root, { ratingKey: '5002', libraryType: 'show', libraryId: '2' }, nav),
  'detail-season': (root) => detailScreen(root, { ratingKey: '5003', libraryType: 'show', libraryId: '2', showKey: '5002' }, nav),
  'detail-episode': (root) => detailScreen(root, { ratingKey: '5004', libraryType: 'show', libraryId: '2', seasonKey: '5003', showKey: '5002' }, nav),
};

// Headless Chrome doesn't fire the lazy/IntersectionObserver poster loader, so
// force every poster/art image to its source + revealed state after mount.
function forcePosters(root) {
  const imgs = root.querySelectorAll('img');
  imgs.forEach((img) => {
    const ds = img.dataset || {};
    const src = ds.posterSrc || ds.src || img.getAttribute('src');
    if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.classList.add('poster--loaded');
    img.style.opacity = '1';
    img.loading = 'eager';
  });
}

window.renderScreen = function (name) {
  setScenario(name);
  base();
  const root = document.getElementById('root');
  root.innerHTML = '';
  const fn = screens[name];
  if (!fn) { root.textContent = 'unknown screen: ' + name; return; }
  try {
    fn(root);
    forcePosters(root);
    setTimeout(() => forcePosters(root), 60);
    setTimeout(() => forcePosters(root), 400);
  } catch (e) { root.innerHTML = '<pre style="color:#f88;padding:40px">' + (e && e.stack || e) + '</pre>'; }
};
window.__harnessReady = true;
