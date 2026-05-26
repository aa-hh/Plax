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
  if (!persisted || !persisted.authToken) {
    return { route: 'pairing', params: {}, mark: 'boot:navigate-pairing' };
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
