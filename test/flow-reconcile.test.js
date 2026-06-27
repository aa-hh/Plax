import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../docs/design-system/flow/sync.mjs';

// Minimal manifest helpers — mirror the indexing loadManifest() does in sync.mjs.
function mkManifest(sections, nodes, edges = []) {
  const m = {
    sections, nodes,
    edges: edges.map((e) => ({ ...e, key: `${e.from}>${e.to}#${e.label || ''}` })),
  };
  return m;
}
const node = (key, section, label, extras = {}) => ({
  key, section, label, kind: 'screen', pos: [0, 0], figmaName: label, ...extras,
});
const section = (key, title) => ({ key, title, pos: [0, 0], size: [100, 100] });

test('reconcile: empty lock + matching live frames → adopt ops', () => {
  const manifest = mkManifest(
    [section('s1', '§1')],
    [node('home', 's1', 'Home')],
  );
  const canvas = {
    sectionsByKey: {}, nodesByKey: {}, edgesByKey: {},
    unstamped: [
      { figmaNodeId: '1:1', name: '§1', type: 'SECTION' },
      { figmaNodeId: '1:2', name: 'Home', type: 'FRAME' },
    ],
  };
  const ops = reconcile(manifest, { sections: {}, nodes: {}, edges: {} }, canvas);
  assert.equal(ops.length, 2);
  assert.equal(ops.filter((o) => o.op === 'adopt').length, 2);
  assert.equal(ops.find((o) => o.key === 's1').figmaNodeId, '1:1');
  assert.equal(ops.find((o) => o.key === 'home').figmaNodeId, '1:2');
});

test('reconcile: matched lock + live + unchanged manifest → empty diff (idempotency)', () => {
  const m = mkManifest([section('s1', '§1')], [node('home', 's1', 'Home')]);
  const hashSec = '1', hashNode = '2';
  // Compute the actual hashes the reconciler will compare against
  const ops0 = reconcile(m, { sections: {}, nodes: {}, edges: {} }, {
    sectionsByKey: {}, nodesByKey: {}, edgesByKey: {},
    unstamped: [
      { figmaNodeId: '1:1', name: '§1', type: 'SECTION' },
      { figmaNodeId: '1:2', name: 'Home', type: 'FRAME' },
    ],
  });
  const lock = { sections: { s1: { figmaNodeId: '1:1', hash: ops0.find((o) => o.key === 's1').hash } },
                 nodes:    { home: { figmaNodeId: '1:2', hash: ops0.find((o) => o.key === 'home').hash } },
                 edges: {} };
  const canvas = {
    sectionsByKey: { s1: { figmaNodeId: '1:1', name: '§1' } },
    nodesByKey:    { home: { figmaNodeId: '1:2', name: 'Home' } },
    edgesByKey: {}, unstamped: [],
  };
  const ops = reconcile(m, lock, canvas);
  assert.equal(ops.length, 0, 'unchanged manifest should produce no ops');
});

test('reconcile: new node in manifest → create op', () => {
  const m = mkManifest([section('s1', '§1')], [node('home', 's1', 'Home'), node('library', 's1', 'Library')]);
  const ops0 = reconcile(mkManifest([section('s1', '§1')], [node('home', 's1', 'Home')]),
    { sections: {}, nodes: {}, edges: {} },
    { sectionsByKey: {}, nodesByKey: {}, edgesByKey: {}, unstamped: [
      { figmaNodeId: '1:1', name: '§1', type: 'SECTION' },
      { figmaNodeId: '1:2', name: 'Home', type: 'FRAME' },
    ] });
  const lock = { sections: { s1: { figmaNodeId: '1:1', hash: ops0.find((o) => o.key === 's1').hash } },
                 nodes:    { home: { figmaNodeId: '1:2', hash: ops0.find((o) => o.key === 'home').hash } },
                 edges: {} };
  const canvas = {
    sectionsByKey: { s1: { figmaNodeId: '1:1', name: '§1' } },
    nodesByKey:    { home: { figmaNodeId: '1:2', name: 'Home' } },
    edgesByKey: {}, unstamped: [],
  };
  const ops = reconcile(m, lock, canvas);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'create');
  assert.equal(ops[0].kind, 'node');
  assert.equal(ops[0].key, 'library');
});

test('reconcile: renamed node label → update op (same key)', () => {
  const before = mkManifest([section('s1', '§1')], [node('home', 's1', 'Home')]);
  const after  = mkManifest([section('s1', '§1')], [node('home', 's1', 'Home Screen')]);
  const ops0 = reconcile(before, { sections: {}, nodes: {}, edges: {} },
    { sectionsByKey: {}, nodesByKey: {}, edgesByKey: {}, unstamped: [
      { figmaNodeId: '1:1', name: '§1', type: 'SECTION' },
      { figmaNodeId: '1:2', name: 'Home', type: 'FRAME' },
    ] });
  const lock = { sections: { s1: { figmaNodeId: '1:1', hash: ops0.find((o) => o.key === 's1').hash } },
                 nodes:    { home: { figmaNodeId: '1:2', hash: ops0.find((o) => o.key === 'home').hash } },
                 edges: {} };
  const canvas = {
    sectionsByKey: { s1: { figmaNodeId: '1:1', name: '§1' } },
    nodesByKey:    { home: { figmaNodeId: '1:2', name: 'Home' } },
    edgesByKey: {}, unstamped: [],
  };
  const ops = reconcile(after, lock, canvas);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'update');
  assert.equal(ops[0].kind, 'node');
  assert.equal(ops[0].key, 'home');
});

test('reconcile: node removed from manifest → delete op', () => {
  const before = mkManifest([section('s1', '§1')], [node('home', 's1', 'Home'), node('library', 's1', 'Library')]);
  const after  = mkManifest([section('s1', '§1')], [node('home', 's1', 'Home')]);
  const ops0 = reconcile(before, { sections: {}, nodes: {}, edges: {} },
    { sectionsByKey: {}, nodesByKey: {}, edgesByKey: {}, unstamped: [
      { figmaNodeId: '1:1', name: '§1', type: 'SECTION' },
      { figmaNodeId: '1:2', name: 'Home', type: 'FRAME' },
      { figmaNodeId: '1:3', name: 'Library', type: 'FRAME' },
    ] });
  const lock = { sections: { s1: { figmaNodeId: '1:1', hash: ops0.find((o) => o.key === 's1').hash } },
                 nodes:    {
                   home:    { figmaNodeId: '1:2', hash: ops0.find((o) => o.key === 'home').hash },
                   library: { figmaNodeId: '1:3', hash: ops0.find((o) => o.key === 'library').hash },
                 },
                 edges: {} };
  const canvas = {
    sectionsByKey: { s1: { figmaNodeId: '1:1', name: '§1' } },
    nodesByKey:    {
      home:    { figmaNodeId: '1:2', name: 'Home' },
      library: { figmaNodeId: '1:3', name: 'Library' },
    },
    edgesByKey: {}, unstamped: [],
  };
  const ops = reconcile(after, lock, canvas);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'delete');
  assert.equal(ops[0].kind, 'node');
  assert.equal(ops[0].key, 'library');
  assert.equal(ops[0].figmaNodeId, '1:3');
});

test('reconcile: edges only managed when options.manageEdges is true (default off)', () => {
  const m = mkManifest(
    [section('s1', '§1')],
    [node('a', 's1', 'A'), node('b', 's1', 'B')],
    [{ from: 'a', to: 'b', label: 'go' }],
  );
  const canvas = {
    sectionsByKey: {}, nodesByKey: {}, edgesByKey: {},
    unstamped: [
      { figmaNodeId: '1:1', name: '§1', type: 'SECTION' },
      { figmaNodeId: '1:2', name: 'A',  type: 'FRAME' },
      { figmaNodeId: '1:3', name: 'B',  type: 'FRAME' },
    ],
  };
  const ops = reconcile(m, { sections: {}, nodes: {}, edges: {} }, canvas);
  assert.equal(ops.filter((o) => o.kind === 'edge').length, 0,
    'edges should be unmanaged by default (adopt-in-place semantics)');

  // Opt-in: edges become managed
  m.options = { manageEdges: true };
  const ops2 = reconcile(m, { sections: {}, nodes: {}, edges: {} }, canvas);
  const edgeOps = ops2.filter((o) => o.kind === 'edge');
  assert.equal(edgeOps.length, 1);
  assert.equal(edgeOps[0].op, 'create');
});
