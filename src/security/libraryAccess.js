/**
 * Role-based library access for restricted Plex Home users.
 */

function filterLibrariesForUser(libraries, user) {
  if (!user || !user.restricted) return libraries;
  return libraries.filter(function (lib) {
    return canAccessLibrary(lib, user);
  });
}

function canAccessLibrary(lib, user) {
  if (!user || !user.restricted) return true;
  if (lib.hidden) return false;
  if (lib.shared === '1' || lib.shared === true) return true;
  return lib._accessible !== false;
}

export { filterLibrariesForUser, canAccessLibrary };
