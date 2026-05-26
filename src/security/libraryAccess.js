/**
 * Role-based library access for restricted Plex Home users.
 *
 * Managed users get libraries via Plex server "Manage Library Access".
 * GET /library/sections with the profile token already returns only allowed
 * sections — do not re-filter on shared=0.
 */

function isRestrictedProfile(user) {
  if (!user) return false;
  if (user.admin) return false;
  return !!user.restricted;
}

function normalizeSectionType(type) {
  var t = String(type || '').toLowerCase();
  if (t === 'movie' || t === '1') return 'movie';
  if (t === 'show' || t === '2' || t === 'tv' || t === 'series' || t === 'shows') return 'show';
  return t;
}

function isMovieOrTvSection(libOrType) {
  if (libOrType && typeof libOrType === 'object') {
    return isMovieOrTvSection(libOrType.type);
  }
  var t = normalizeSectionType(libOrType);
  return t === 'movie' || t === 'show';
}

function filterLibrariesForUser(libraries, user) {
  var visible = (libraries || []).filter(function (lib) {
    return lib && !lib.hidden;
  });
  if (!isRestrictedProfile(user)) return visible;
  return visible.filter(function (lib) {
    return canAccessLibrary(lib, user);
  });
}

function canAccessLibrary(lib, user) {
  if (!isRestrictedProfile(user)) return true;
  if (!lib || lib.hidden) return false;
  if (lib.id == null || lib.id === '') return false;
  if (lib._accessible === false) return false;
  return true;
}

export {
  isRestrictedProfile,
  normalizeSectionType,
  isMovieOrTvSection,
  filterLibrariesForUser,
  canAccessLibrary
};
