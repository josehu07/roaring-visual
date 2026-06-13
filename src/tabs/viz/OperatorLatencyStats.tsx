import type { OpScenarioId } from '../OperatorLatency';
import {
  OPS_LATENCY_SCENARIOS,
  type OpId,
} from '../../data/opsLatency';

interface Props {
  distId: string;
  opId: OpScenarioId;
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

export function OperatorLatencyStats({ distId, opId, selected }: Props) {
  if (!selected) {
    return (
      <div className="stats-panel stats-panel--empty">
        <p className="stats-panel__hint">
          Click a data point on the 3D plot to inspect its detailed statistics.
        </p>
      </div>
    );
  }

  const scenario = OPS_LATENCY_SCENARIOS.find((s) => s.id === distId);
  if (!scenario) {
    return (
      <div className="stats-panel stats-panel--empty">
        <p className="stats-panel__hint">No latency data for this scenario.</p>
      </div>
    );
  }

  const { pi, ni } = selected;
  const nValue = scenario.n[ni];
  const pValue = scenario.p[pi];
  const ns = scenario.ops[opId as OpId]?.nsMedian[pi]?.[ni];
  const kOut = scenario.ops[opId as OpId]?.kOutMean[pi]?.[ni];
  // For "_small" ops the second bitmap is built at a lower density
  // (p_small ≈ p × 0.01). For "_similar" ops it's drawn at the same density.
  const isSmallOp = opId.endsWith('-small1');
  const pSecond = isSmallOp ? scenario.pSmallMean[pi]?.[ni] ?? null : pValue;
  const kA = scenario.kAMean[pi]?.[ni] ?? null;
  const kB = isSmallOp
    ? scenario.kBSmallMean[pi]?.[ni] ?? null
    : scenario.kBSimilarMean[pi]?.[ni] ?? null;

  return (
    <div className="stats-panel stats-panel--stacked">
      <div className="stats-panel__header">
        <div className="stats-panel__headings">
          <h3 className="stats-panel__title">Selected Data Point</h3>
          <p className="stats-panel__subtitle">
            Median latency across repetitions. Output density is the averaged
            result cardinality divided by universe size.
          </p>
        </div>
        <dl className="stats-summary">
          <div className="stats-summary__item">
            <dt>Universe Size</dt>
            <dd>{fmtUniverse(nValue)}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Main Density %</dt>
            <dd>{fmtPercent(pValue)}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Second Density %</dt>
            <dd>{pSecond != null ? fmtPercent(pSecond) : '—'}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Output Density %</dt>
            <dd>
              {kOut != null && nValue > 0
                ? fmtPercent(kOut / nValue)
                : '—'}
            </dd>
          </div>
          <div className="stats-summary__item">
            <dt>Latency</dt>
            <dd>{ns != null ? fmtTime(ns) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="stats-panel__grid stats-panel__grid--three">
        <section className="stats-block">
          <h4 className="stats-block__title">Main Bitmap (A)</h4>
          <table className="stats-table">
            <tbody>
              <tr>
                <th scope="row">Density %</th>
                <td>{fmtPercent(pValue)}</td>
              </tr>
              <tr>
                <th scope="row">Cardinality</th>
                <td>{fmtCount(kA)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="stats-block">
          <h4 className="stats-block__title">Second Bitmap (B)</h4>
          <table className="stats-table">
            <tbody>
              <tr>
                <th scope="row">Density %</th>
                <td>{pSecond != null ? fmtPercent(pSecond) : '—'}</td>
              </tr>
              <tr>
                <th scope="row">Cardinality</th>
                <td>{fmtCount(kB)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="stats-block">
          <h4 className="stats-block__title">Output Bitmap</h4>
          <table className="stats-table">
            <tbody>
              <tr>
                <th scope="row">Density %</th>
                <td>
                  {kOut != null && nValue > 0
                    ? fmtPercent(kOut / nValue)
                    : '—'}
                </td>
              </tr>
              <tr>
                <th scope="row">Cardinality</th>
                <td>{fmtCount(kOut)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
