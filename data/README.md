# Benchmark data & harness

This directory holds the raw benchmark results that power the visualizations,
plus the Rust harness that produces them.

## Layout

- `Cargo.toml`, `Cargo.lock`, `src/` — the Rust benchmark harness
  (`roaring-bench`). Depends only on public crates (`roaring`, `rand`,
  `rand_pcg`).
- `src/bin/` — three benchmark binaries:
  - `size_bench` — serialized bitmap size across (universe, density).
  - `ops_bench` — merge-operation latency (intersect / union / difference).
  - `lookup_bench` — single-value lookup latency (hit / miss).
- `size-bench/`, `ops-bench/`, `lookup-bench/` — JSONL result files, one row
  per measured `(distribution, n, p, rep)`.
- `ROARING_VERSION.txt` — the exact `roaring` crate version the data was
  produced with, and the statistics fields captured per bitmap.

## Regenerating the raw data (optional)

Running the benchmarks is only needed to reproduce or extend the measurements.
It is not required to build or run the website — the generated TypeScript under
`../src/data/` is the runtime source of truth.

Each binary takes a distribution on the command line and writes JSONL to
stdout:

```sh
cd data
cargo run --release --bin size_bench   -- uniform     > size-bench/uniform_results.jsonl
cargo run --release --bin ops_bench    -- zipf 1.0     > ops-bench/zipf_s1.0_ops.jsonl
cargo run --release --bin lookup_bench -- block 64     > lookup-bench/blockC64_lookup.jsonl
```

Distributions: `uniform`, `zipf <s>`, `block <c>`.

## Turning raw data into site data

The JSONL files do not auto-reflect into the app. After (re)generating them,
rebuild the TypeScript modules consumed by the website:

```sh
cd ..
npm run build-data
```

This runs the four `scripts/build-*-data.mjs` aggregators, which read the JSONL
here and emit `src/data/{sizeBench,invertedIndex,opsLatency,lookupLatency}.ts`.
