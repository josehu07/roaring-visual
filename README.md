# Roaring Bitmap Visualization

URL: <https://josehu.com/apps/roaring-visual>

An interactive static website that explains [Roaring bitmap](https://roaringbitmap.org/)
internals and presents benchmark data as explorable 3D plots:

- **Data Structures** — how a Roaring bitmap splits 32-bit values into
  containers (array / bitmap / run) and indexes them.
- **Bitmap Size Profile** — optimized serialized size across universe size and
  density, by input distribution.
- **Inverted Index Size** — total storage for an inverted index built from
  one bitmap per unique value.
- **Merge Ops Latency** — intersect / union / difference latency.
- **Bit Lookup Latency** — single-value hit / miss lookup latency.

Built with [Vite](https://vitejs.dev/), [React](https://react.dev/), and [Plotly](https://plotly.com/javascript/).

## Development

Requires [Node.js](https://nodejs.org/) 18+.

```sh
npm install      # install dependencies
npm run dev      # start the dev server at http://localhost:3000
```

## Distribution

```sh
npm run build    # type-check, then bundle to dist/
npm run preview  # serve the production build locally to verify
```

The build emits a fully static site into `dist/`. Asset paths are relative, so
the contents of `dist/` can be opened directly from disk or hosted from any
path on any static host (S3, GitHub Pages, Netlify, nginx, …) — just serve the
folder.

## Other scripts

```sh
npm test         # run the unit tests once (Vitest)
npm run lint     # lint the source
npm run build-data   # regenerate src/data/*.ts from the raw benchmarks
```

## Repo layout

```text
src/
  App.tsx              tab shell and routing
  tabs/                one component per visualization tab
  tabs/viz/            Plotly plot + stats panels and the structure diagrams
  data/                AUTO-GENERATED benchmark data (do not edit by hand)
  lib/, types/         URL-state helpers and local type shims
scripts/               build-*-data.mjs — aggregate raw data into src/data/*.ts
data/                  Rust benchmark harness + raw results (see data/README.md)
```

The files in `src/data/` are generated from the raw benchmark results in
`data/` by the scripts in `scripts/`. See [data/README.md](data/README.md) for
how the benchmarks are run and regenerated. You do not need the Rust toolchain
to build or run the website.
