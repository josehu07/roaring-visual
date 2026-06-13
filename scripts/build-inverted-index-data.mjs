#!/usr/bin/env node
/**
 * Build the inverted-index size profile: total bitmap storage for an inverted
 * index over a record list.
 *
 * Mapping from the primary (n, p) grid:
 *   Treat each primary row (n=N, p=P) as "one bitmap of N·P set bits in a
 *   universe of N". Reinterpret it as an inverted-index record list of
 *   length L=N where each unique value repeats 1/P times on average:
 *     list length              L = N
 *     per-bitmap cardinality   k = N·P
 *     number of bitmaps        u = L / k = 1 / P
 *     value cardinality %      c = u / L = 1 / (N·P)
 *     total bytes              = u · optBytes(N, P)
 *                              = (1/P) · optBytes(N, P)
 *
 * This yields a "stripe" across the (N, C) plane — each measured primary
 * (n, p) maps to exactly one (n, c) and the missing cells are the high-c /
 * large-n corner, which corresponds to per-bitmap cardinalities below the
 * smallest p we measured (p_min = 1e-4).
 *
 * For those missing cells we use an analytical estimator derived from the
 * roaring serialization layout. For a bitmap of cardinality k over universe
 * n with no run-optimization wins:
 *
 *   numContainers = min(k, ceil(n / 65536))
 *   avgPerCont    = k / numContainers
 *   payload       = avgPerCont <= 4096
 *                 ? k * 2                       // array containers (2 B/val)
 *                 : numContainers * 8192        // bitset containers (8 KiB)
 *   est_bytes     = 8  (fixed cookie/count)
 *                 + numContainers * 8           (key + cardinality per cont.)
 *                 + payload
 *
 * Verified against measured primary data: e.g. uniform (n=1e5, p=1e-4, k=6)
 * gives 8 + 2·8 + 6·2 = 36 B, matching the measured average to the byte.
 *
 * The estimator assumes no run-container wins, so for block-clustered
 * scenarios in the estimated region it is a (loose) upper bound — but the
 * estimated region is dominated by very small k (each bitmap has only a
 * handful of values), so per-bitmap size differences between scenarios are
 * small in absolute terms.
 *
 * Edge case per project design: when round(n·c) < 1 (fewer than one unique
 * value for the entire list), clamp to 1 bitmap holding all L values and
 * use the measured optBytes at p=1. This flattens the plot on that edge
 * rather than dropping to zero.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DATA_DIR = join(REPO_ROOT, 'data', 'size-bench');
const OUT_FILE = join(REPO_ROOT, 'src', 'data', 'invertedIndex.ts');

const SCENARIOS = [
  { id: 'uniform',      file: 'uniform_results.jsonl',      label: 'Uniform' },
  { id: 'zipf-0.9',     file: 'zipf_s0.9_results.jsonl',    label: 'Zipf (s=0.9)' },
  { id: 'zipf-1.0',     file: 'zipf_s1.0_results.jsonl',    label: 'Zipf (s=1.0)' },
  { id: 'zipf-1.2',     file: 'zipf_s1.2_results.jsonl',    label: 'Zipf (s=1.2)' },
  { id: 'block-c8',     file: 'block_c8_results.jsonl',     label: 'Block (c=8)' },
  { id: 'block-c64',    file: 'block_c64_results.jsonl',    label: 'Block (c=64)' },
  { id: 'block-c1024',  file: 'block_c1024_results.jsonl',  label: 'Block (c=1024)' },
];

/**
 * Parse one primary JSONL file into a map:
 *   Map<n, Map<p, avgOptBytes>>
 * and also return the sorted n and p value sets.
 */
function loadPrimary(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter(Boolean);

  const byN = new Map();
  const ns = new Set();
  const ps = new Set();
  for (const line of lines) {
    const row = JSON.parse(line);
    if (row.type !== 'row') continue;
    const { n, p } = row;
    const opt = row.optimized?.bytes ?? 0;
    ns.add(n);
    ps.add(p);
    if (!byN.has(n)) byN.set(n, new Map());
    const byP = byN.get(n);
    if (!byP.has(p)) byP.set(p, { sum: 0, count: 0 });
    const cell = byP.get(p);
    cell.sum += opt;
    cell.count += 1;
  }

  // Collapse reps to averages.
  const avg = new Map();
  for (const [n, byP] of byN) {
    const m = new Map();
    for (const [p, cell] of byP) m.set(p, cell.sum / cell.count);
    avg.set(n, m);
  }
  return {
    avg,
    ns: [...ns].sort((a, b) => a - b),
    ps: [...ps].sort((a, b) => a - b),
  };
}

/**
 * Analytical estimate of serialized roaring bitmap bytes for a bitmap with
 * `k` values over universe `n`, assuming no run-container wins.
 *
 * Matches the primary measured data exactly for small k (array containers
 * only), which is the regime where this estimator is used.
 */
function estBitmapBytes(k, n) {
  if (k <= 0) return 8; // empty bitmap: just the header/count pair
  const maxContainers = Math.max(1, Math.ceil(n / 65536));
  const numContainers = Math.min(k, maxContainers);
  const avg = k / numContainers;
  const payload = avg <= 4096 ? k * 2 : numContainers * 8192;
  // 8 B fixed (cookie + container count) + 8 B per container descriptor
  // (key + cardinality) + payload.
  return 8 + numContainers * 8 + payload;
}

/** Returns the p in PS closest to `target` within relative tolerance, or null. */
function findMeasuredP(PS, target) {
  let best = null;
  let bestDiff = Infinity;
  for (const p of PS) {
    // Relative tolerance because p spans several decades.
    const diff = Math.abs(p - target) / target;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  // Accept as "same" within 1e-6 relative — union c values are products of
  // exact grid values so exact matches should hit well below this.
  return bestDiff < 1e-6 ? best : null;
}

/**
 * For one scenario, compute the inverted-index grid over (n, C_union).
 *
 * `measuredAvg` provides measured per-bitmap bytes as Map<n, Map<p, bytes>>.
 * `estimate(k, n)` is the per-bitmap byte estimator (the analytical formula)
 * for cells outside the measured (p) set.
 */
function buildInvertedIndex(measuredAvg, ps, ns, cUnionSorted, estimate) {
  const nValues = ns;
  const cValues = cUnionSorted;

  const makeGrid = () =>
    cValues.map(() => new Array(nValues.length).fill(null));
  const totalBytes = makeGrid();
  const estimated = cValues.map(() => new Array(nValues.length).fill(false));
  const numBitmaps = makeGrid();
  const kPerBitmap = makeGrid();

  // Measured bytes at (n, p=1), used for the "unique < 1" clamp case.
  const measuredFullByN = new Map();
  for (const n of nValues) {
    const m = measuredAvg.get(n);
    if (!m) continue;
    const pMax = Math.max(...m.keys());
    measuredFullByN.set(n, m.get(pMax));
  }

  for (let ci = 0; ci < cValues.length; ci++) {
    const c = cValues[ci];
    for (let ni = 0; ni < nValues.length; ni++) {
      const n = nValues[ni];
      const uniqRaw = n * c;

      if (uniqRaw < 0.5) {
        // Fewer than one unique value on average → single bitmap of the
        // whole list (p=1). Measured, not estimated.
        const total = measuredFullByN.get(n);
        if (total != null) {
          totalBytes[ci][ni] = +total.toFixed(2);
          numBitmaps[ci][ni] = 1;
          kPerBitmap[ci][ni] = n;
          estimated[ci][ni] = false;
        }
        continue;
      }

      const unique = Math.max(1, Math.round(uniqRaw));
      const k = Math.max(1, Math.round(n / unique));
      const pNeed = k / n;

      const pMeasured = findMeasuredP(ps, pNeed);
      const nMap = measuredAvg.get(n);
      let bpm;
      let isEstimate;
      if (pMeasured != null && nMap && nMap.has(pMeasured)) {
        bpm = nMap.get(pMeasured);
        isEstimate = false;
      } else {
        bpm = estimate(k, n);
        isEstimate = true;
      }
      if (bpm == null) continue;

      totalBytes[ci][ni] = +(unique * bpm).toFixed(2);
      numBitmaps[ci][ni] = unique;
      kPerBitmap[ci][ni] = k;
      estimated[ci][ni] = isEstimate;
    }
  }

  return { totalBytes, estimated, numBitmaps, kPerBitmap };
}

// --- Load primary data for all scenarios. -----------------------------------
const primaries = SCENARIOS.map((s) => ({
  meta: s,
  data: loadPrimary(join(DATA_DIR, s.file)),
}));

// --- Compute shared C union across all scenarios. ---------------------------
// All primary scenarios share the same (n, p) grid, so the c values match
// across scenarios. Build the union once.
const cSet = new Set();
for (const { data } of primaries) {
  for (const n of data.ns) {
    for (const p of data.ps) {
      cSet.add(1 / (n * p));
    }
  }
}
// Extend the c axis upward to 100 % so readers can see the "every record is
// unique" slice. These values aren't reachable via 1/(n·p) because the
// primary grid's smallest n·p product is 10. They are filled via the
// analytical estimator below, which is exact for k ∈ {1, 2, 5}.
for (const extra of [0.2, 0.5, 1.0]) cSet.add(extra);
const cUnion = [...cSet].sort((a, b) => a - b);

// --- Build each scenario's inverted-index grid. ----------------------------
const scenarios = primaries.map(({ meta, data }) => {
  const roaring = buildInvertedIndex(
    data.avg,
    data.ps,
    data.ns,
    cUnion,
    estBitmapBytes,
  );
  return {
    id: meta.id,
    label: meta.label,
    n: data.ns,
    c: cUnion,
    totalBytes: roaring.totalBytes,
    estimated: roaring.estimated,
    numBitmaps: roaring.numBitmaps,
    kPerBitmap: roaring.kPerBitmap,
  };
});

// --- Emit TS module. -------------------------------------------------------
const header = `// AUTO-GENERATED by scripts/build-inverted-index-data.mjs — do not edit by hand.
// Source: data/size-bench/*_results.jsonl via the mapping described in that
// script's header comment. Regenerate via
//   \`node scripts/build-inverted-index-data.mjs\`.

/** Per-[c][n] grid of values (null = no data point). */
export type InvertedIndexGrid<T> = (T | null)[][];

/**
 * Total storage size of an inverted index (one roaring bitmap per unique
 * value) over a record list of length \`n\` where value cardinality is \`c\`
 * (unique values / list length). Each cell is either derived from a measured
 * primary (n, p) datapoint or produced by an analytical estimator for the
 * small-per-bitmap-cardinality regime; see \`estimated\` to distinguish.
 */
export interface InvertedIndexScenarioGrid {
  id: string;
  label: string;
  /** Universe / record-list size axis values (ascending). */
  n: number[];
  /** Value-cardinality % axis values (ascending, 0..1), union across the primary grid. */
  c: number[];
  /** Total Roaring storage bytes, indexed [ci][ni]. */
  totalBytes: InvertedIndexGrid<number>;
  /** True where the Roaring cell came from the analytical estimator. */
  estimated: boolean[][];
  /** Number of bitmaps (≈ unique values), indexed [ci][ni]. */
  numBitmaps: InvertedIndexGrid<number>;
  /** Per-bitmap cardinality (values per bitmap), indexed [ci][ni]. */
  kPerBitmap: InvertedIndexGrid<number>;
}
`;

const body = `\nexport const INVERTED_INDEX_SCENARIOS: InvertedIndexScenarioGrid[] = ${JSON.stringify(
  scenarios,
  null,
  2,
)};\n`;

writeFileSync(OUT_FILE, header + body);

// --- Report. ---------------------------------------------------------------
console.log(`Wrote ${OUT_FILE}`);
console.log(`Scenarios: ${scenarios.map((s) => s.id).join(', ')}`);
console.log(`Grid: ${scenarios[0].c.length} c × ${scenarios[0].n.length} n`);

// Sanity: how many cells are measured vs estimated, per kind?
const tally = (grid, flag) => {
  let measured = 0, est = 0, empty = 0;
  for (let ci = 0; ci < grid.length; ci++) {
    for (let ni = 0; ni < grid[ci].length; ni++) {
      if (grid[ci][ni] == null) empty++;
      else if (flag[ci][ni]) est++;
      else measured++;
    }
  }
  return { measured, est, empty };
};
for (const s of scenarios) {
  const r = tally(s.totalBytes, s.estimated);
  console.log(
    `  ${s.id.padEnd(12)} roaring(m=${r.measured} e=${r.est} ∅=${r.empty})`,
  );
}
