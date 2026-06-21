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

  // First run: no backend chosen yet → choose Plex or Jellyfin.
  if (!provider) {
    return { route: 'provider-picker', params: {}, mark: 'boot:navigate-provider-picker' };
  }

  // Jellyfin has per-user sessions (no owner-proxy) and no plex.tv rediscovery, so
  // its routing turns on whether we have an active server + token vs. just a list of
  // previously-used servers:
  //   • signed in with a configured server → "who's watching" (bootstrap host)
  //   • known servers but not signed in     → server picker (choose one or add new)
  //   • no known servers                     → login (type the server address)
  if (provider === 'jellyfin') {
    if (persisted.authToken && persisted.jellyfinServer) {
      return { route: 'jellyfin-users', params: { _from: 'launch' }, mark: 'boot:navigate-jellyfin-users' };
    }
    if (persisted.jellyfinServers && persisted.jellyfinServers.length) {
      return { route: 'jellyfin-servers', params: {}, mark: 'boot:navigate-jellyfin-servers' };
    }
    return { route: 'pairing', params: { provider: 'jellyfin' }, mark: 'boot:navigate-pairing' };
  }

  // Backend chosen but not signed in → that backend's auth screen.
  if (!persisted.authToken) {
    return { route: 'pairing', params: { provider: provider }, mark: 'boot:navigate-pairing' };
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
