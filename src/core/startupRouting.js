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

  // Backend chosen but not signed in → that backend's auth screen.
  if (!persisted.authToken) {
    return { route: 'pairing', params: { provider: provider }, mark: 'boot:navigate-pairing' };
  }

  // Jellyfin has per-user sessions (no owner-proxy). The user picker needs a
  // configured server — without one (e.g. provider was set to jellyfin but a stale
  // Plex token lingers, or sign-in never completed), send them to the login to
  // configure the server, NOT to an empty "who's watching".
  if (provider === 'jellyfin') {
    if (persisted.jellyfinServer) {
      return { route: 'jellyfin-users', params: { _from: 'launch' }, mark: 'boot:navigate-jellyfin-users' };
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
