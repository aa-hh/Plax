/**
 * Gate: no CSS feature unsupported by Chromium 53 (webOS 4 / the B8) may land
 * without an explicit `/* chrome53-ok: reason *\/` acknowledgement on its line.
 *
 * This is the machine-enforced half of "every decision considers Chrome 53":
 * it runs as part of plain `npm test` (and therefore CI), costs zero tokens,
 * and is scoped to this project. The escape hatch forces a conscious call.
 *
 * See scripts/check-chrome53-css.cjs for the feature list and rationale.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findViolations } = require('../scripts/check-chrome53-css.cjs');

test('CSS contains no un-acknowledged Chrome 53-unsupported features', () => {
  const v = findViolations();
  const report = v
    .map((x) => `  ${x.file}:${x.line} [${x.rule}] ${x.why}\n      ${x.text}`)
    .join('\n');
  assert.strictEqual(
    v.length,
    0,
    `\nFound ${v.length} Chrome 53-unsupported CSS feature(s) without a /* chrome53-ok */ note:\n${report}\n`
  );
});
