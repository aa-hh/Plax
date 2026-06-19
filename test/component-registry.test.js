// Integrity guard for the shared design registry.
//
// The registry (docs/design-system/component-registry.md) is the single source of
// truth edited by multiple agents across branches. It has been destructively
// overwritten/truncated twice (e.g. commit 0ee9799 reduced ~13 components to one).
// These assertions fail `npm test` the moment the file loses its structure or a
// mass of entries — so a truncation can't silently merge into the trunk. This test
// travels with the repo, so it protects every branch regardless of agent hooks.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(__dirname, '..', 'docs', 'design-system', 'component-registry.md');
const src = readFileSync(REGISTRY, 'utf8');

test('registry: structural anchors present (not truncated)', function () {
  const anchors = [
    '# TV Component Spec Registry',
    '## Design Decision Protocol',
    '## Figma node-id index',
    '## Component specs',
    '## Maintenance',
  ];
  for (const a of anchors) {
    assert.ok(src.includes(a), `registry is missing a structural anchor: "${a}" (was it overwritten/truncated?)`);
  }
});

test('registry: status legend symbols intact', function () {
  for (const sym of ['✅', '🚧', '📝', '📐']) {
    assert.ok(src.includes(sym), `registry is missing status symbol ${sym} from the legend`);
  }
});

test('registry: Figma fileKey recorded', function () {
  assert.ok(src.includes('TLtknC3rZXQqWe3uIivt94'), 'registry is missing the Figma fileKey');
});

test('registry: keeps a healthy number of component entries (mass-deletion guard)', function () {
  const entries = (src.match(/^### /gm) || []).length;
  assert.ok(entries >= 15, `registry has only ${entries} '### ' entries; expected >= 15. A drop this large means a destructive rewrite — restore from git history, do not commit the truncated file.`);
});

test('registry: entries carry a Status (spec discipline)', function () {
  const sections = src.split(/^### /m).slice(1);
  const withStatus = sections.filter(function (s) { return /\*\*Status:\*\*/.test(s); }).length;
  assert.ok(withStatus >= 15, `only ${withStatus} entries carry a **Status:** line; expected >= 15`);
});
