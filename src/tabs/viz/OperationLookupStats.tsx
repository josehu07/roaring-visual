import { LOOKUP_LATENCY_SCENARIOS } from '../../data/lookupLatency';

interface Props {
  distId: string;
  selected: { pi: number; ni: number } | null;
}

function fmtTime(ns: number): string {
  if (ns < 1e3) return `${ns.toFixed(0)} ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(1)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(1)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
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
  if (pct >= 0.01) return `${pct.toFixed(2)} %`;
  return `${pct.toExponential(1)} %`;
}

function fmtCount(v: number | null | undefined): string {
  if (v == null) return '—';
  return Math.round(v).toLocaleString();
}

export function OperationLookupStats({ distId, selected }: Props) {
  if (!selected) {
    return (
      <div className="stats-panel stats-panel--empty">
        <p className="stats-panel__hint">
          Click a data point on the 3D plot to inspect its detailed statistics.
        </p>
      </div>
    );
  }

  const scenario = LOOKUP_LATENCY_SCENARIOS.find((s) => s.id === distId);
  if (!scenario) {
    return (
      <div className="stats-panel stats-panel--empty">
        <p className="stats-panel__hint">No lookup data for this scenario.</p>
      </div>
    );
  }

  const { pi, ni } = selected;
  const nValue = scenario.n[ni];
  const pValue = scenario.p[pi];
  const side = scenario.roaring;
  const hitNs = side.hit.nsMedian[pi]?.[ni] ?? null;
  const missNs = side.miss.nsMedian[pi]?.[ni] ?? null;
  const k = scenario.kMean[pi]?.[ni] ?? null;

  return (
    <div className="stats-panel stats-panel--stacked">
      <div className="stats-panel__header">
        <div className="stats-panel__headings">
          <h3 className="stats-panel__title">Selected Data Point</h3>
          <p className="stats-panel__subtitle">
            Median single-lookup latency across ~300 probes per bitmap. Hit
            probes a present value; miss probes an absent value.
          </p>
        </div>
        <dl className="stats-summary">
          <div className="stats-summary__item">
            <dt>Universe Size</dt>
            <dd>{fmtUniverse(nValue)}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Density %</dt>
            <dd>{fmtPercent(pValue)}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Cardinality</dt>
            <dd>{fmtCount(k)}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Hit Latency</dt>
            <dd>{hitNs != null ? fmtTime(hitNs) : '—'}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Miss Latency</dt>
            <dd>{missNs != null ? fmtTime(missNs) : '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
