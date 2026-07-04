import { getState } from '../../core/store.js';
import { filterLibrariesForUser, isMovieOrTvSection } from '../../security/libraryAccess.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import { iconSvgForKind, libraryIconKind } from '../icons/navIcons.js';
import { plaxWordmarkSvg, plaxMarkSvg } from '../brand/plaxLogo.js';

var SEARCH_NAV_ITEM = { id: 'search', label: 'Search', iconKind: 'search' };
var SETTINGS_NAV_ITEM = { id: 'settings', label: 'Settings', iconKind: 'settings' };

function buildHubNavItems(state) {
  var user = state.activeHomeUser || state.user;
  var items = [{ id: 'home', label: 'Home', iconKind: 'home' }];

  if (canUseWatchlists(user)) {
    items.push({ id: 'watchlist', label: 'Watchlist', iconKind: 'watchlist' });
  }

  // Leaving Soon — its own destination (moved out of the default home rails).
  // Sits after Watchlist, before the per-library entries.
  items.push({ id: 'leavingSoon', label: 'Leaving Soon', iconKind: 'leavingSoon' });

  var libraries = filterLibrariesForUser(state.libraries || [], user).filter(isMovieOrTvSection);
  libraries.forEach(function (lib) {
    items.push({
      id: 'library:' + lib.id,
      label: lib.title,
      iconKind: libraryIconKind(lib),
      libraryId: lib.id,
      library: lib
    });
  });

  return items;
}

function buildSearchNavItems() {
  return [SEARCH_NAV_ITEM];
}

function buildSettingsNavItems() {
  return [SETTINGS_NAV_ITEM];
}

function libraryHubId(library) {
  if (!library || library.id == null) return '';
  return 'library:' + library.id;
}

function resolveActiveHubId(options) {
  options = options || {};
  if (options.hubId) return options.hubId;
  if (options.activeRoute === 'settings') return 'settings';
  if (options.activeRoute === 'search') return 'search';
  if (options.library) return libraryHubId(options.library);
  return 'home';
}

function refreshHubNavIcons(host, activeHubId) {
  if (!host) return;
  Array.prototype.slice.call(host.querySelectorAll('.browsing-hub-item')).forEach(function (btn) {
    var id = btn.getAttribute('data-hub-id');
    var isActive = id === activeHubId;
    btn.classList.toggle('active', isActive);
    // aria-current marks the active section for assistive tech and gives the
    // collapsed-rail "keep the active label legible" CSS a stable hook.
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
    // Material nav pattern: every glyph is OUTLINED when idle and FILLED when
    // the section is active. Re-parse the SVG only when the filled-state
    // actually flips (i.e. the two buttons whose selection changed), not on
    // every nav item — so this stays as cheap as the old watchlist-only path.
    var kind = btn.dataset.iconKind || 'home';
    var wantFilled = isActive ? '1' : '0';
    if (btn.dataset.iconFilled === wantFilled) return;
    var iconWrap = btn.querySelector('.browsing-hub-item__icon');
    if (iconWrap) {
      iconWrap.innerHTML = iconSvgForKind(kind, isActive);
      btn.dataset.iconFilled = wantFilled;
    }
  });
}

function handleHubNavSelect(item, navigate, callbacks) {
  callbacks = callbacks || {};
  if (!item || !navigate) return;

  if (item.id === 'home') {
    navigate('home', {});
    return;
  }
  if (item.id === 'watchlist') {
    navigate('home', { hub: 'watchlist' });
    return;
  }
  if (item.id === 'leavingSoon') {
    navigate('home', { hub: 'leavingSoon' });
    return;
  }
  if (item.id === 'search') {
    navigate('search', { _from: callbacks.fromRoute || 'home' });
    return;
  }
  if (item.id === 'settings') {
    navigate('settings', { _from: callbacks.fromRoute || 'home' });
    return;
  }
  if (item.id.indexOf('library:') === 0 && item.library) {
    if (callbacks.onLibrarySelect) {
      callbacks.onLibrarySelect(item.library);
      return;
    }
    navigate('library', { libraryId: item.library.id });
  }
}

function escapeLabel(text) {
  var d = document.createElement('span');
  d.textContent = String(text || '');
  return d.innerHTML;
}

function appendHubButtons(navEl, items, activeId, onSelect) {
  items.forEach(function (item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'browsing-hub-item';
    btn.setAttribute('data-hub-id', item.id);
    btn.dataset.iconKind = item.iconKind;
    btn.tabIndex = 0;
    btn.setAttribute('aria-label', item.label);
    if (item.id === activeId) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    }

    // Active section renders the FILLED glyph; idle sections render OUTLINED.
    var filled = item.id === activeId;
    btn.dataset.iconFilled = filled ? '1' : '0';
    btn.innerHTML =
      '<span class="browsing-hub-item__icon">' + iconSvgForKind(item.iconKind, filled) + '</span>' +
      '<span class="browsing-hub-item__label">' + escapeLabel(item.label) + '</span>';

    btn.addEventListener('click', function () {
      onSelect(item);
    });
    navEl.appendChild(btn);
  });
}

function renderHubSection(parent, sectionClass, title, items, activeId, onSelect) {
  var section = document.createElement('div');
  section.className = 'browsing-hub-section' + (sectionClass ? ' ' + sectionClass : '');
  if (title) {
    var heading = document.createElement('p');
    heading.className = 'browsing-hub-section__title';
    heading.textContent = title;
    section.appendChild(heading);
  }
  var nav = document.createElement('div');
  nav.className = 'browsing-hub-nav';
  nav.setAttribute('role', 'group');
  appendHubButtons(nav, items, activeId, onSelect);
  section.appendChild(nav);
  parent.appendChild(section);
  return nav;
}

function focusSidebarHub(host, activeHubId) {
  if (!host) return false;
  var target = host.querySelector('.browsing-hub-item[data-hub-id="' + activeHubId + '"]') ||
    host.querySelector('.browsing-hub-item');
  if (!target) return false;
  target.focus();
  return true;
}

// Entry "peek" hint: briefly expand the collapsed rail on a cold landing so the
// user can see where nav lives, then collapse it. Class hook only — DesignSystem
// styles --peek to the expanded width with a transition; we just toggle it and
// remove it after a one-shot delay (cleared if the host goes away first).
var SIDEBAR_PEEK_MS = 1400;

function playSidebarPeekHint(host) {
  if (!host) return function () {};
  // Don't fight an already-focused rail (it's expanded anyway).
  var hasFocus = typeof host.contains === 'function' && document.activeElement &&
    host.contains(document.activeElement);
  if (hasFocus) return function () {};
  host.classList.add('browsing-hub-nav-host--peek');
  var timer = setTimeout(function () {
    timer = null;
    host.classList.remove('browsing-hub-nav-host--peek');
  }, SIDEBAR_PEEK_MS);
  return function cancelPeek() {
    if (timer) { clearTimeout(timer); timer = null; }
    host.classList.remove('browsing-hub-nav-host--peek');
  };
}

/**
 * Mount Media, Search, and System sidebar sections.
 */
function mountBrowsingHubNav(host, options) {
  options = options || {};
  var state = options.state || getState();
  var mediaItems = buildHubNavItems(state);
  var searchItems = buildSearchNavItems();
  var settingsItems = buildSettingsNavItems();
  var activeId = resolveActiveHubId({
    hubId: options.activeHubId,
    activeRoute: options.activeRoute,
    library: options.activeLibrary
  });

  var knownIds = mediaItems.concat(searchItems, settingsItems).map(function (item) { return item.id; });
  if (knownIds.indexOf(activeId) < 0) {
    activeId = 'home';
  }

  host.innerHTML = '';
  // Collapsed-rail current-section cue is the kit's selected pill behind the icon
  // (.active → secondary-container @40%, app.css); no separate collapsed-label hook.
  host.className = 'browsing-hub-nav-host';
  host.setAttribute('role', 'navigation');
  host.setAttribute('aria-label', 'Browse');

  // App mark at the top of the drawer (Google TV nav-drawer anatomy).
  var brand = document.createElement('div');
  brand.className = 'browsing-hub-brand';
  brand.setAttribute('aria-hidden', 'true');
  // Brand lockup = the full "plax" wordmark when the rail has room (peek/
  // expanded), collapsing to the compact "x" mark when icon-only. Both are
  // inline SVG (crisp at any scale; linearGradient/stroke render on Chromium 53)
  // sourced from the single brand module so the launcher icon stays in sync.
  brand.innerHTML =
    '<span class="browsing-hub-brand__mark">' +
      plaxMarkSvg() +
    '</span>' +
    '<span class="browsing-hub-brand__wordmark">' +
      plaxWordmarkSvg() +
    '</span>';
  host.appendChild(brand);

  // Expand-on-focus via a JS class. CSS :focus-within is Chrome 60+, but the B8
  // is Chromium 53, so the rail never expanded there — focusin/out works on 53.
  function syncExpanded() {
    var inside = document.activeElement && host.contains(document.activeElement);
    // Cold-landing guard: the home screen parks initial focus on the rail
    // before the feed exists (data-initial-focus="1") and displaces it to the
    // first card once content arrives. Expanding for that transient parking
    // spot made the rail flash open→closed on every load, so stay collapsed
    // for the programmatic landing; the keydown below (a REAL user interaction
    // inside the rail) clears the flag and re-syncs.
    if (inside && host.getAttribute('data-initial-focus') === '1') return;
    host.classList.toggle('browsing-hub-nav-host--expanded', !!inside);
  }
  host.addEventListener('focusin', syncExpanded);
  host.addEventListener('focusout', function () { setTimeout(syncExpanded, 0); });
  host.addEventListener('keydown', function () {
    if (host.getAttribute('data-initial-focus') === '1') {
      host.removeAttribute('data-initial-focus');
      syncExpanded();
    }
  });

  function onItemSelect(item) {
    handleHubNavSelect(item, options.navigate, {
      onLibrarySelect: options.onLibrarySelect,
      fromRoute: options.fromRoute
    });
    if (options.onSelect) options.onSelect(item);
  }

  renderHubSection(host, 'browsing-hub-section--media', 'Media', mediaItems, activeId, onItemSelect);
  renderHubSection(host, 'browsing-hub-section--search', 'Search', searchItems, activeId, onItemSelect);
  renderHubSection(host, 'browsing-hub-section--system', 'System', settingsItems, activeId, onItemSelect);
  refreshHubNavIcons(host, activeId);

  // No auto "peek" on landing: the rail expands ONLY when the user explicitly
  // moves focus into it (syncExpanded on focusin/focusout above).

  return {
    mediaItems: mediaItems,
    searchItems: searchItems,
    settingsItems: settingsItems,
    activeId: activeId,
    setActiveId: function (nextId) {
      activeId = nextId;
      refreshHubNavIcons(host, activeId);
    },
    focusSidebar: function () {
      return focusSidebarHub(host, activeId);
    },
    destroy: function () {}
  };
}

export {
  buildHubNavItems,
  buildSearchNavItems,
  buildSettingsNavItems,
  SEARCH_NAV_ITEM,
  SETTINGS_NAV_ITEM,
  libraryHubId,
  resolveActiveHubId,
  refreshHubNavIcons,
  handleHubNavSelect,
  focusSidebarHub,
  playSidebarPeekHint,
  mountBrowsingHubNav
};
