import { getState } from '../../core/store.js';
import { filterLibrariesForUser, isMovieOrTvSection } from '../../security/libraryAccess.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import { iconSvgForKind, libraryIconKind } from '../icons/navIcons.js';

var SEARCH_NAV_ITEM = { id: 'search', label: 'Search', iconKind: 'search' };
var SETTINGS_NAV_ITEM = { id: 'settings', label: 'Settings', iconKind: 'settings' };

function buildHubNavItems(state) {
  var user = state.activeHomeUser || state.user;
  var items = [{ id: 'home', label: 'Home', iconKind: 'home' }];

  if (canUseWatchlists(user)) {
    items.push({ id: 'watchlist', label: 'Watchlist', iconKind: 'watchlist' });
  }

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
    var kind = btn.dataset.iconKind || 'home';
    var iconWrap = btn.querySelector('.browsing-hub-item__icon');
    if (iconWrap) {
      iconWrap.innerHTML = iconSvgForKind(kind, kind === 'watchlist' && isActive);
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
    if (item.id === activeId) btn.classList.add('active');

    var filledBookmark = item.iconKind === 'watchlist' && item.id === activeId;
    btn.innerHTML =
      '<span class="browsing-hub-item__icon">' + iconSvgForKind(item.iconKind, filledBookmark) + '</span>' +
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
  host.className = 'browsing-hub-nav-host';
  host.setAttribute('role', 'navigation');
  host.setAttribute('aria-label', 'Browse');

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
    }
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
  mountBrowsingHubNav
};
