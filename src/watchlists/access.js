/**
 * Watchlists are available to Plex Home admin and managed (restricted) profiles only.
 */

function canUseWatchlists(user) {
  if (!user) return false;
  if (user.guest) return false;
  return !!(user.admin || user.restricted);
}

export { canUseWatchlists };
