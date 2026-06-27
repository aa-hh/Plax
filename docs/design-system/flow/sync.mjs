#!/usr/bin/env node
/**
 * XPlay user-flow Figma reconciler.
 *
 * `flow.yaml` is the source of truth; this CLI diffs the manifest against `flow.lock.json`
 * (cache) and the live canvas (captured via `use_figma`), then emits only the delta.
 *
 *   node sync.mjs mermaid                    # regen flow.mmd
 *   node sync.mjs scan                       # print a use_figma script to dump live canvas
 *   node sync.mjs plan [--canvas FILE]       # diff manifest vs lock(+canvas) → ops + use_figma scripts
 *   node sync.mjs apply --result FILE        # update flow.lock.json from a returned scan result
 *   node sync.mjs render [--changed]         # delegate to render.mjs for thumbnails
 *
 * Identity: every managed Figma node carries its manifest `key` via
 * `setSharedPluginData('xplayflow', 'key', key)`. The lock file is a fast cache,
 * not the source of truth — re-scanning the canvas recovers the mapping.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dir = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dir, 'flow.yaml');
const LOCK     = join(__dir, 'flow.lock.json');
const MMD      = join(__dir, 'flow.mmd');
const THUMBS   = join(__dir, 'thumbnails');

const NAMESPACE = 'xplayflow'; // shared-plugin-data namespace

// ── manifest / lock IO ───────────────────────────────────────────────────────
function loadManifest() {
  const raw = readFileSync(MANIFEST, 'utf8');
  const m = yaml.load(raw);
  // index for fast lookup
  m._nodesByKey    = Object.fromEntries(m.nodes.map((n) => [n.key, n]));
  m._sectionsByKey = Object.fromEntries(m.sections.map((s) => [s.key, s]));
  // stable edge keys: from→to+label (label nullable)
  m.edges = m.edges.map((e) => ({ ...e, key: edgeKey(e) }));
  m._edgesByKey = Object.fromEntries(m.edges.map((e) => [e.key, e]));
  return m;
}
function loadLock() {
  if (!existsSync(LOCK)) return { sections: {}, nodes: {}, edges: {} };
  return JSON.parse(readFileSync(LOCK, 'utf8'));
}
function writeLock(lock) {
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
}

const edgeKey = (e) => `${e.from}>${e.to}#${e.label || ''}`;

// ── geometry: anchor an arrow at the right edge-midpoints of its endpoint frames ──
const DEFAULT_SCREEN_SIZE = [460, 287];
const DEFAULT_REF_SIZE    = [340, 220];
const DEFAULT_HUB_SIZE    = [180, 500];
const DEFAULT_NOTE_SIZE   = [240, 180];

function nodeSize(n) {
  if (n.size) return n.size;
  if (n.kind === 'screen') return DEFAULT_SCREEN_SIZE;
  if (n.kind === 'hub')    return DEFAULT_HUB_SIZE;
  if (n.kind === 'note')   return DEFAULT_NOTE_SIZE;
  return DEFAULT_REF_SIZE;
}
function nodeBox(n) {
  const [w, h] = nodeSize(n);
  const [x, y] = n.pos;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}
/** Pick endpoint sides to minimize crossings: prefer horizontal connection when |dx|>|dy|. */
function routeEdge(fromBox, toBox) {
  const dx = toBox.cx - fromBox.cx, dy = toBox.cy - fromBox.cy;
  let from, to;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // horizontal-dominant
    if (dx > 0) { from = { x: fromBox.x + fromBox.w, y: fromBox.cy }; to = { x: toBox.x, y: toBox.cy }; }
    else        { from = { x: fromBox.x,             y: fromBox.cy }; to = { x: toBox.x + toBox.w, y: toBox.cy }; }
  } else {
    if (dy > 0) { from = { x: fromBox.cx, y: fromBox.y + fromBox.h }; to = { x: toBox.cx, y: toBox.y }; }
    else        { from = { x: fromBox.cx, y: fromBox.y }; to = { x: toBox.cx, y: toBox.y + toBox.h }; }
  }
  return { from, to };
}

// ── content hashing — used to detect changes for incremental sync ────────────
function djb2(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(16); }
const sectionHash = (s) => djb2([s.title, s.pos.join(','), s.size.join(',')].join('|'));
const nodeHash    = (n) => djb2([n.label, n.kind, n.screen || '', n.sublabel || '', JSON.stringify(n.pos), JSON.stringify(n.size || [])].join('|'));
const edgeHashOf  = (e) => djb2([e.from, e.to, e.label || '', e.style || 'solid'].join('|'));

// ── pure reconciler — manifest + lock + canvas → ordered op list ─────────────
/**
 * canvas: { nodesByKey: { [key]: { figmaNodeId, frameName, sectionKey? } },
 *           sectionsByKey: { [key]: { figmaNodeId, name } },
 *           edgesByKey: { [key]: { figmaNodeId } },  // optional
 *           unstamped: [{ figmaNodeId, name }] }     // candidates for adoption
 */
export function reconcile(manifest, lock, canvas) {
  const ops = [];
  const liveS = (canvas && canvas.sectionsByKey) || {};
  const liveN = (canvas && canvas.nodesByKey)    || {};
  const liveE = (canvas && canvas.edgesByKey)    || {};
  const unstamped = (canvas && canvas.unstamped) || [];

  // ── sections ──
  for (const s of manifest.sections) {
    const lkS = lock.sections[s.key];
    const lvS = liveS[s.key];
    const want = sectionHash(s);
    if (!lvS) {
      // try adopt by name
      const adopt = unstamped.find((u) => u.type === 'SECTION' && u.name === s.title);
      if (adopt) ops.push({ op: 'adopt', kind: 'section', key: s.key, figmaNodeId: adopt.figmaNodeId, hash: want });
      else       ops.push({ op: 'create', kind: 'section', key: s.key, manifest: s, hash: want });
    } else if (!lkS || lkS.hash !== want) {
      ops.push({ op: 'update', kind: 'section', key: s.key, figmaNodeId: lvS.figmaNodeId, manifest: s, hash: want });
    }
  }
  const manifestSectionKeys = new Set(manifest.sections.map((s) => s.key));
  for (const k of Object.keys(lock.sections)) {
    if (!manifestSectionKeys.has(k)) ops.push({ op: 'delete', kind: 'section', key: k, figmaNodeId: lock.sections[k].figmaNodeId });
  }

  // ── nodes ──
  for (const n of manifest.nodes) {
    const lkN = lock.nodes[n.key];
    const lvN = liveN[n.key];
    const want = nodeHash(n);
    if (!lvN) {
      const adopt = unstamped.find((u) => u.type === 'FRAME' && u.name === n.figmaName);
      if (adopt) ops.push({ op: 'adopt', kind: 'node', key: n.key, figmaNodeId: adopt.figmaNodeId, hash: want });
      else       ops.push({ op: 'create', kind: 'node', key: n.key, manifest: n, hash: want });
    } else if (!lkN || lkN.hash !== want) {
      ops.push({ op: 'update', kind: 'node', key: n.key, figmaNodeId: lvN.figmaNodeId, manifest: n, hash: want });
    }
  }
  const manifestNodeKeys = new Set(manifest.nodes.map((n) => n.key));
  for (const k of Object.keys(lock.nodes)) {
    if (!manifestNodeKeys.has(k)) ops.push({ op: 'delete', kind: 'node', key: k, figmaNodeId: lock.nodes[k].figmaNodeId });
  }

  // ── edges (only manage edges that exist in lock OR are new in manifest) ──
  // First-run adoption mode leaves edges unmanaged unless the user opts in.
  const manageEdges = (manifest.options && manifest.options.manageEdges) || false;
  if (manageEdges) {
    for (const e of manifest.edges) {
      const lkE = lock.edges[e.key];
      const lvE = liveE[e.key];
      const want = edgeHashOf(e);
      if (!lvE) ops.push({ op: 'create', kind: 'edge', key: e.key, manifest: e, hash: want });
      else if (!lkE || lkE.hash !== want) ops.push({ op: 'update', kind: 'edge', key: e.key, figmaNodeId: lvE.figmaNodeId, manifest: e, hash: want });
    }
    const manifestEdgeKeys = new Set(manifest.edges.map((e) => e.key));
    for (const k of Object.keys(lock.edges)) {
      if (!manifestEdgeKeys.has(k)) ops.push({ op: 'delete', kind: 'edge', key: k, figmaNodeId: lock.edges[k].figmaNodeId });
    }
  }

  return ops;
}

// ── Mermaid generator ────────────────────────────────────────────────────────
function toMermaid(manifest) {
  const sanitize = (k) => k.replace(/[^A-Za-z0-9_]/g, '_');
  const lines = ['flowchart LR', `  %% Generated from flow.yaml — DO NOT EDIT BY HAND`, ''];
  for (const s of manifest.sections) {
    lines.push(`  subgraph ${sanitize(s.key)}["${s.title}"]`);
    lines.push(`    direction LR`);
    const nodes = manifest.nodes.filter((n) => n.section === s.key);
    for (const n of nodes) {
      const id = sanitize(n.key);
      const label = n.label.replace(/"/g, '\\"');
      if (n.kind === 'ref' || n.kind === 'note') lines.push(`    ${id}>"${label}"]`);
      else if (n.kind === 'hub')                 lines.push(`    ${id}(("${label}"))`);
      else                                       lines.push(`    ${id}["${label}"]`);
    }
    lines.push('  end');
  }
  lines.push('');
  for (const e of manifest.edges) {
    const arrow = e.style === 'dashed' ? '-..->' : '-->';
    const lbl = e.label ? `|${e.label.replace(/\|/g, ' ')}|` : '';
    lines.push(`  ${sanitize(e.from)} ${arrow}${lbl} ${sanitize(e.to)}`);
  }
  return lines.join('\n') + '\n';
}

// ── emitters: ops → use_figma scripts ────────────────────────────────────────
function scanScript(fileKey) {
  return `
// Returns the live canvas state needed by sync.mjs plan.
const PAGE = figma.currentPage;
const NS = ${JSON.stringify(NAMESPACE)};
const sectionsByKey = {}, nodesByKey = {}, edgesByKey = {};
const unstamped = [];
for (const n of PAGE.children) {
  const key = n.getSharedPluginData(NS, 'key');
  const entry = { figmaNodeId: n.id, name: n.name, type: n.type };
  if (key) {
    if (n.type === 'SECTION') sectionsByKey[key] = entry;
    else if (n.type === 'VECTOR') edgesByKey[key] = entry;
    else nodesByKey[key] = entry;
  } else unstamped.push(entry);
  if (n.type === 'SECTION') {
    for (const c of n.children) {
      const ck = c.getSharedPluginData(NS, 'key');
      const ce = { figmaNodeId: c.id, name: c.name, type: c.type, sectionKey: key };
      if (ck) {
        if (c.type === 'VECTOR') edgesByKey[ck] = ce;
        else nodesByKey[ck] = ce;
      } else unstamped.push(ce);
    }
  }
}
return { sectionsByKey, nodesByKey, edgesByKey, unstamped };
`.trim();
}

function stampScript(ops, opts = {}) {
  const stamps = ops
    .filter((o) => (o.op === 'adopt' || (o.op === 'create' && opts.stampAfterCreate)) && o.figmaNodeId)
    .map((o) => ({ id: o.figmaNodeId, key: o.key, hash: o.hash }));
  if (!stamps.length) return null;
  return `
const NS = ${JSON.stringify(NAMESPACE)};
const stamps = ${JSON.stringify(stamps)};
const stamped = [];
for (const { id, key, hash } of stamps) {
  const n = figma.getNodeById(id);
  if (!n) { stamped.push({ key, error: 'not-found' }); continue; }
  n.setSharedPluginData(NS, 'key', key);
  n.setSharedPluginData(NS, 'hash', String(hash));
  stamped.push({ key, id, name: n.name, type: n.type });
}
return stamped;
`.trim();
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const cmd = isMain ? process.argv[2] : null;

function cmdMermaid() {
  const m = loadManifest();
  writeFileSync(MMD, toMermaid(m));
  console.log('wrote', MMD);
}

function cmdScan() {
  const m = loadManifest();
  console.log('// Paste this into a use_figma call with fileKey:', m.figmaFileKey);
  console.log('// The returned JSON is the canvas state for `node sync.mjs plan --canvas <file>`.');
  console.log();
  console.log(scanScript(m.figmaFileKey));
}

function cmdPlan() {
  const m = loadManifest();
  const lock = loadLock();
  const canvasIdx = process.argv.indexOf('--canvas');
  const canvas = canvasIdx > 0 ? JSON.parse(readFileSync(process.argv[canvasIdx + 1], 'utf8')) : null;
  if (!canvas) {
    console.log('no --canvas: showing manifest-vs-lock plan only (no live diff)');
  }
  const ops = reconcile(m, lock, canvas || {});
  console.log(`# Plan: ${ops.length} op(s)`);
  for (const op of ops) {
    const tag = `${op.op}:${op.kind}`;
    console.log(`  ${tag.padEnd(18)} ${op.key}${op.figmaNodeId ? '  → ' + op.figmaNodeId : ''}`);
  }
  if (!ops.length) { console.log('  (nothing to do — board matches manifest)'); return; }
  // emit a stamping script for adoption/creation
  const script = stampScript(ops, { stampAfterCreate: false });
  if (script) {
    console.log('\n# Stamp script — paste into use_figma:');
    console.log(script);
  }
  // Persist the plan so `apply` can update the lock from result JSON
  writeFileSync(join(__dir, '.plan.json'), JSON.stringify({ ops, ts: Date.now() }, null, 2));
}

function cmdApply() {
  // After running the stamp script in use_figma, pipe its returned JSON to apply
  // to update the lock with the figma node IDs and content hashes.
  const ridx = process.argv.indexOf('--result');
  if (ridx < 0) { console.error('apply requires --result <file>'); process.exit(1); }
  const result = JSON.parse(readFileSync(process.argv[ridx + 1], 'utf8'));
  const planPath = join(__dir, '.plan.json');
  if (!existsSync(planPath)) { console.error('no .plan.json — run `plan` first'); process.exit(1); }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const lock = loadLock();
  const m = loadManifest();
  // result is [{ key, id, name, type } | { key, error }]
  for (const r of result) {
    if (r.error) { console.warn('skipped', r.key, '-', r.error); continue; }
    const op = plan.ops.find((o) => o.key === r.key);
    if (!op) continue;
    const entry = { figmaNodeId: r.id, hash: op.hash };
    if (op.kind === 'section') lock.sections[r.key] = entry;
    else if (op.kind === 'edge') lock.edges[r.key] = entry;
    else lock.nodes[r.key] = entry;
  }
  writeLock(lock);
  console.log('lock updated:', Object.keys(lock.sections).length, 'sections,', Object.keys(lock.nodes).length, 'nodes,', Object.keys(lock.edges).length, 'edges');
}

async function cmdRender() {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', [join(__dir, 'render.mjs'), ...process.argv.slice(3)], { stdio: 'inherit' });
  process.exit(r.status || 0);
}

if (isMain) {
  switch (cmd) {
    case 'mermaid': cmdMermaid(); break;
    case 'scan':    cmdScan(); break;
    case 'plan':    cmdPlan(); break;
    case 'apply':   cmdApply(); break;
    case 'render':  cmdRender(); break;
    default:
      console.log('usage: node sync.mjs <mermaid|scan|plan|apply|render>');
      console.log('  mermaid                          regen flow.mmd');
      console.log('  scan                             print a use_figma script to capture the live canvas');
      console.log('  plan [--canvas <file>]           diff manifest vs lock(+canvas) → ops + use_figma stamp script');
      console.log('  apply --result <file>            update flow.lock.json from a returned stamp result');
      console.log('  render [args...]                 delegate to render.mjs');
      process.exit(cmd ? 1 : 0);
  }
}
