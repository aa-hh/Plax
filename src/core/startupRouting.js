import { isRestrictedProfile } from '../security/libraryAccess.js';

function hasIncompleteRestrictedSession(persisted, ownerToken) {
  return !!(
    persisted &&
    persisted.activeHomeUser &&
    isRestrictedProfile(persisted.activeHomeUser) &&
    persisted.authToken &&
    !ownerToken
  );
}

function resolveStartupRoute(persisted, ownerToken) {
  // Backward-compat: installs that predate provider selection but already hold a
  // token are Plex users — treat a present authToken as an implicit 'plex' choice
  // so they are never bounced to the provider picker.
  var provider = (persisted && persisted.provider) ||
    (persisted && persisted.authToken ? 'plex' : null);

  var savedLinkCount = (persisted && persisted.savedLinks && persisted.savedLinks.length) || 0;

  // First run: no backend chosen yet. If saved links exist (forgot the active
  // session but kept the saves), offer the cross-provider picker; else the chooser.
  if (!provider) {
    if (savedLinkCount > 0) {
      return { route: 'server-picker', params: {}, mark: 'boot:navigate-server-picker' };
    }
    return { route: 'provider-picker', params: {}, mark: 'boot:navigate-provider-picker' };
  }

  // Backend chosen but not signed in → saved links (one tap back into any saved
  // server, Plex or Jellyfin) if present; otherwise that backend's auth screen.
  if (!persisted.authToken) {
    if (savedLinkCount > 0) {
      return { route: 'server-picker', params: {}, mark: 'boot:navigate-server-picker' };
    }
    return { route: 'pairing', params: { provider: provider }, mark: 'boot:navigate-pairing' };
  }

  // Jellyfin (signed in): the user picker needs a configured server. With one →
  // who's watching. Without → saved links (if any) else the login form.
  if (provider === 'jellyfin') {
    if (persisted.jellyfinServer) {
      return { route: 'jellyfin-users', params: { _from: 'launch' }, mark: 'boot:navigate-jellyfin-users' };
    }
    if (savedLinkCount > 0) {
      return { route: 'server-picker', params: {}, mark: 'boot:navigate-server-picker' };
    }
    return { route: 'pairing', params: { provider: 'jellyfin' }, mark: 'boot:navigate-pairing' };
  }

  var params = { _from: 'launch', _alwaysChoose: true };
  if (hasIncompleteRestrictedSession(persisted, ownerToken)) params._retry = true;

  return {
    route: 'profile-picker',
    params: params,
    mark: 'boot:navigate-profile-picker'
  };
}

export { hasIncompleteRestrictedSession, resolveStartupRoute };
