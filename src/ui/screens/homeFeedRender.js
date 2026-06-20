/**
 * Prepare the home-feed container for a render pass and report whether there is
 * anything to render in `rows`.
 *
 * A non-append (fresh) render is the "initial phase resolved" signal, so it must
 * drop the loading skeletons NOW — even when this phase produced no rows. If the
 * caller returned early on empty rows *before* clearing, the skeletons would
 * leak: a brand-new user has an empty On Deck and can have Recently Added /
 * promoted rows still in the deferred phase, so the initial phase resolves empty;
 * the stale skeletons would then sit above the later-appended deferred rows and
 * clip under the immersive hero once a card is focused. Append renders never
 * clear — they add to the rows already committed.
 *
 * Kept as a standalone, dependency-free helper so it's directly unit-testable
 * (homeScreen.js itself pulls in the store / Plex / prefetch import chain).
 *
 * @param {{innerHTML:string}|null} el  the `#home-feed` container
 * @param {Array|null} rows             rows for this pass
 * @param {boolean} append              true = add below existing rows; false = fresh render
 * @returns {boolean}                   true when `rows` has content to render
 */
function prepareFeedForRender(el, rows, append) {
  if (!el) return false;
  if (!append) el.innerHTML = '';
  return !!(rows && rows.length);
}

export { prepareFeedForRender };
