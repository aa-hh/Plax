# AGENTS.md — src/security

## Purpose

Role-based library visibility for restricted Plex Home profiles. One module that
decides which library sections a managed user may see and how section types are
normalised. Pure predicates over user + library objects — no I/O, no storage.

*Keep this file up to date when:* the restricted-profile rules or section-type
normalisation change.

## Notable Patterns

- **Trust the server's section list; don't re-filter on `shared=0`.** Plex's
  `GET /library/sections` with a managed profile's token already returns only the
  sections that profile may access (Manage Library Access). `filterLibrariesForUser`
  drops only `hidden` libraries (and, for restricted users, those explicitly
  marked `_accessible === false`) — see the header comment in `libraryAccess.js`.
- **Admins bypass everything.** `isRestrictedProfile` is false for `user.admin`,
  so admins see all non-hidden libraries. The whole gate only narrows for
  `user.restricted`.
- **Section-type normalisation is lenient.** `normalizeSectionType` collapses
  numeric (`1`/`2`) and string aliases (`tv`/`series`/`shows`) to `movie`/`show`;
  `isMovieOrTvSection` accepts either a type string or a library object. Used by
  [../ui](../ui/AGENTS.md)'s hub nav to show only Movie/TV libraries.

## Key Types

| Export | Role |
|---|---|
| `isRestrictedProfile(user)` | True for managed (non-admin, `restricted`) Home users |
| `filterLibrariesForUser(libs, user)` | Drop hidden / inaccessible sections for the user |
| `canAccessLibrary(lib, user)` | Per-library predicate behind the filter |
| `normalizeSectionType(type)` | Collapse type aliases to `movie` / `show` |
| `isMovieOrTvSection(libOrType)` | True for Movie or TV sections |
