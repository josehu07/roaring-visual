import type { InvertedIndexScenarioGrid } from '../../data/invertedIndex';

interface Props {
  scenario: InvertedIndexScenarioGrid;
  selected: { ci: number; ni: number } | null;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TiB`;
}

function fmtUniverse(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)} K`;
  return `${n}`;
}

function fmtPercent(p: number): string {
  const pct = p * 100;
  if (pct >= 1) return `${pct.toFixed(pct < 10 ? 1 : 0)} %`;
  if (pct >= 0.0001) return `${pct.toPrecision(2)} %`;
  return `${pct.toExponential(1)} %`;
}

function fmtCount(v: number | null): string {
  if (v == null) return '—';
  return Math.round(v).toLocaleString();
}

export function InvertedIndexStats({ scenario, selected }: Props) {
  if (!selected) {
    return (
      <div className="stats-panel stats-panel--empty">
        <p className="stats-panel__hint">
          Click a data point on the 3D plot to inspect its detailed statistics.
        </p>
      </div>
    );
  }

  const { ci, ni } = selected;
  const nValue = scenario.n[ni];
  const cValue = scenario.c[ci];
  const roaringTotal = scenario.totalBytes[ci]?.[ni];
  const numBitmaps = scenario.numBitmaps[ci]?.[ni];
  const kPerBitmap = scenario.kPerBitmap[ci]?.[ni];
  const avgPerBitmap =
    roaringTotal != null && numBitmaps && numBitmaps > 0
      ? roaringTotal / numBitmaps
      : null;

  return (
    <div className="stats-panel stats-panel--inverted-index">
      <div className="stats-panel__header">
        <div className="stats-panel__headings">
          <h3 className="stats-panel__title">Selected Data Point</h3>
          <p className="stats-panel__subtitle">
            Total storage for an inverted index over a record list of length n
            where value cardinality is c %.
          </p>
        </div>
        <dl className="stats-summary">
          <div className="stats-summary__item">
            <dt>List Length (n)</dt>
            <dd>{fmtUniverse(nValue)}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Value Cardinality %</dt>
            <dd>{fmtPercent(cValue)}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Bitmaps</dt>
            <dd>{fmtCount(numBitmaps)}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Bitmap Density %</dt>
            <dd>
              {kPerBitmap != null && nValue > 0
                ? fmtPercent(kPerBitmap / nValue)
                : '—'}
            </dd>
          </div>
          <div className="stats-summary__item">
            <dt>Avg / Bitmap</dt>
            <dd>{avgPerBitmap != null ? fmtBytes(avgPerBitmap) : '—'}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Total Size</dt>
            <dd>{roaringTotal != null ? fmtBytes(roaringTotal) : '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
