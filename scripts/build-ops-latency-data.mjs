#!/usr/bin/env node
/**
 * Read each ops-bench JSONL file, average latency (ns) and k_out over reps
 * per (n, p) for every operator scenario, and emit a single TS module with
 * one grid per (distribution, operator) combination.
 *
 * Output shape per scenario:
 *   { id, label, n[], p[], ops: { [opId]: { nsMedian, kOutMean } } }
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DATA_DIR = join(REPO_ROOT, 'data', 'ops-bench');
const OUT_FILE = join(REPO_ROOT, 'src', 'data', 'opsLatency.ts');

const SCENARIOS = [
  { id: 'uniform',      file: 'uniform_ops.jsonl',      label: 'Uniform' },
  { id: 'zipf-0.9',     file: 'zipf_s0.9_ops.jsonl',    label: 'Zipf (s=0.9)' },
  { id: 'zipf-1.0',     file: 'zipf_s1.0_ops.jsonl',    label: 'Zipf (s=1.0)' },
  { id: 'zipf-1.2',     file: 'zipf_s1.2_ops.jsonl',    label: 'Zipf (s=1.2)' },
  { id: 'block-c8',     file: 'blockC8_ops.jsonl',      label: 'Block (c=8)' },
  { id: 'block-c64',    file: 'blockC64_ops.jsonl',     label: 'Block (c=64)' },
  { id: 'block-c1024',  file: 'blockC1024_ops.jsonl',   label: 'Block (c=1024)' },
];

// Op identifiers as they appear in the JSONL rows, in the order we want to
// present them in the UI. The UI-side op ids ("intersect-similar" etc.) are
// kebab-case; we translate on read.
const OP_IDS = [
  'intersect_similar',
  'intersect_small',
  'union_similar',
  'union_small',
  'diff_similar',
  'diff_small',
];

const KEBAB = {
  intersect_similar: 'intersect-similar',
  intersect_small: 'intersect-small1',
  union_similar: 'union-similar',
  union_small: 'union-small1',
  diff_similar: 'diff-similar',
  diff_small: 'diff-small1',
};

// Median is more representative than the mean for latency — tails from OS
// jitter shouldn't dominate the surface. Three reps isn't a big sample, but
// the median of 3 is still noticeably more stable than the mean across our
// smallest buckets.
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function loadScenario(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter(Boolean);

  // byN: Map<n, Map<p, {
  //   [opId]: { ns: number[], kOut: number[] },
  //   pSmall: number[],       // p_small from the raw row
  //   kA: number[],           // k_a from the raw row
  //   kBSimilar: number[],    // k_b_similar from the raw row
  //   kBSmall: number[],      // k_b_small from the raw row
  // }>>
  const byN = new Map();
  const ns = new Set();
  const ps = new Set();

  for (const line of lines) {
    const row = JSON.parse(line);
    if (row.type !== 'row') continue;
    const { n, p } = row;
    ns.add(n);
    ps.add(p);

    if (!byN.has(n)) byN.set(n, new Map());
    const byP = byN.get(n);
    if (!byP.has(p)) {
      const init = { pSmall: [], kA: [], kBSimilar: [], kBSmall: [] };
      for (const op of OP_IDS) init[op] = { ns: [], kOut: [] };
      byP.set(p, init);
    }
    const cell = byP.get(p);
    if (typeof row.p_small === 'number') cell.pSmall.push(row.p_small);
    if (typeof row.k_a === 'number') cell.kA.push(row.k_a);
    if (typeof row.k_b_similar === 'number') cell.kBSimilar.push(row.k_b_similar);
    if (typeof row.k_b_small === 'number') cell.kBSmall.push(row.k_b_small);
    for (const op of OP_IDS) {
      const val = row.ops?.[op];
      if (!val) continue;
      if (typeof val.ns === 'number') cell[op].ns.push(val.ns);
      if (typeof val.k_out === 'number') cell[op].kOut.push(val.k_out);
    }
  }

  const nValues = [...ns].sort((a, b) => a - b);
  const pValues = [...ps].sort((a, b) => a - b);

  const makeGrid = () => pValues.map(() => new Array(nValues.length).fill(null));
  const ops = {};
  for (const op of OP_IDS) {
    ops[KEBAB[op]] = {
      nsMedian: makeGrid(),
      kOutMean: makeGrid(),
    };
  }
  const pSmallMean = makeGrid();
  const kAMean = makeGrid();
  const kBSimilarMean = makeGrid();
  const kBSmallMean = makeGrid();

  for (let pi = 0; pi < pValues.length; pi++) {
    for (let ni = 0; ni < nValues.length; ni++) {
      const cell = byN.get(nValues[ni])?.get(pValues[pi]);
      if (!cell) continue;
      for (const op of OP_IDS) {
        const k = KEBAB[op];
        const nsMed = median(cell[op].ns);
        const kOutAvg = mean(cell[op].kOut);
        if (nsMed != null) ops[k].nsMedian[pi][ni] = +nsMed.toFixed(2);
        if (kOutAvg != null) ops[k].kOutMean[pi][ni] = +kOutAvg.toFixed(2);
      }
      const pSm = mean(cell.pSmall);
      const kAAvg = mean(cell.kA);
      const kBSimAvg = mean(cell.kBSimilar);
      const kBSmAvg = mean(cell.kBSmall);
      // p_small is exact per row (a deterministic function of p), so no need
      // for heavy rounding — keep a few decimals for clarity.
      if (pSm != null) pSmallMean[pi][ni] = +pSm.toPrecision(6);
      if (kAAvg != null) kAMean[pi][ni] = +kAAvg.toFixed(2);
      if (kBSimAvg != null) kBSimilarMean[pi][ni] = +kBSimAvg.toFixed(2);
      if (kBSmAvg != null) kBSmallMean[pi][ni] = +kBSmAvg.toFixed(2);
    }
  }

  return {
    n: nValues,
    p: pValues,
    pSmallMean,
    kAMean,
    kBSimilarMean,
    kBSmallMean,
    ops,
  };
}

const scenarios = SCENARIOS.map((meta) => {
  const grid = loadScenario(join(DATA_DIR, meta.file));
  return { id: meta.id, label: meta.label, ...grid };
});

// --- Emit TS module. -------------------------------------------------------
const header = `// AUTO-GENERATED by scripts/build-ops-latency-data.mjs — do not edit by hand.
// Source: data/ops-bench/*_ops.jsonl. Regenerate via
//   \`node scripts/build-ops-latency-data.mjs\`.

/** Per-[p][n] grid of averaged values (null = missing data point). */
export type OpsGrid = (number | null)[][];

export type OpId =
  | 'intersect-similar'
  | 'intersect-small1'
  | 'union-similar'
  | 'union-small1'
  | 'diff-similar'
  | 'diff-small1';

export interface OpGrids {
  /** Median latency in nanoseconds, indexed [p][n]. */
  nsMedian: OpsGrid;
  /** Mean output cardinality, indexed [p][n]. */
  kOutMean: OpsGrid;
}

export interface OpsLatencyScenario {
  id: string;
  label: string;
  /** Universe size axis values (ascending). */
  n: number[];
  /** Main-bitmap density-percent axis values (ascending, 0..1). */
  p: number[];
  /** Mean second-bitmap density for the small-1% scenarios, indexed [p][n]. */
  pSmallMean: OpsGrid;
  /** Mean measured cardinality of bitmap A (main), indexed [p][n]. */
  kAMean: OpsGrid;
  /** Mean measured cardinality of bitmap B in the "similar" scenarios. */
  kBSimilarMean: OpsGrid;
  /** Mean measured cardinality of bitmap B in the "small 1%" scenarios. */
  kBSmallMean: OpsGrid;
  /** Per-operator latency + output-cardinality grids (Roaring). */
  ops: Record<OpId, OpGrids>;
}
`;

const body = `\nexport const OPS_LATENCY_SCENARIOS: OpsLatencyScenario[] = ${JSON.stringify(
  scenarios,
  null,
  2,
)};\n`;

writeFileSync(OUT_FILE, header + body);

console.log(`Wrote ${OUT_FILE}`);
console.log(`Scenarios: ${scenarios.map((s) => s.id).join(', ')}`);
const s0 = scenarios[0];
console.log(`Grid: ${s0.p.length} p × ${s0.n.length} n`);

// Report per-scenario coverage per op for both kinds.
const tallyOps = (ops) =>
  Object.entries(ops).map(([op, g]) => {
    let filled = 0;
    for (const row of g.nsMedian) for (const v of row) if (v != null) filled++;
    return `${op}=${filled}`;
  }).join(' ');
for (const s of scenarios) {
  console.log(`  ${s.id.padEnd(12)} roaring(${tallyOps(s.ops)})`);
}
