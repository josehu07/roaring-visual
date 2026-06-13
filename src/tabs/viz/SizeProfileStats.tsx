import type { ScenarioGrid, ScenarioStats } from '../../data/sizeBench';

interface Props {
  scenario: ScenarioGrid;
  selected: { pi: number; ni: number } | null;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
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

function fmtCount(v: number | null): string {
  if (v == null) return '—';
  return Math.round(v).toLocaleString();
}

function fmtMaybeBytes(v: number | null): string {
  if (v == null) return '—';
  return fmtBytes(v);
}

function pick(stats: ScenarioStats, field: keyof ScenarioStats, pi: number, ni: number): number | null {
  return stats[field]?.[pi]?.[ni] ?? null;
}

function ContainerRow({
  label,
  count,
  values,
  bytes,
}: {
  label: string;
  count: number | null;
  values: number | null;
  bytes: number | null;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{fmtCount(count)}</td>
      <td>{fmtCount(values)}</td>
      <td>{fmtMaybeBytes(bytes)}</td>
    </tr>
  );
}

function StatsTable({ stats, pi, ni }: { stats: ScenarioStats; pi: number; ni: number }) {
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th scope="col">Container type</th>
          <th scope="col">Count</th>
          <th scope="col">Values</th>
          <th scope="col">Bytes</th>
        </tr>
      </thead>
      <tbody>
        <ContainerRow
          label="Array"
          count={pick(stats, 'n_array_containers', pi, ni)}
          values={pick(stats, 'n_values_array_containers', pi, ni)}
          bytes={pick(stats, 'n_bytes_array_containers', pi, ni)}
        />
        <ContainerRow
          label="Run"
          count={pick(stats, 'n_run_containers', pi, ni)}
          values={pick(stats, 'n_values_run_containers', pi, ni)}
          bytes={pick(stats, 'n_bytes_run_containers', pi, ni)}
        />
        <ContainerRow
          label="Bitset"
          count={pick(stats, 'n_bitset_containers', pi, ni)}
          values={pick(stats, 'n_values_bitset_containers', pi, ni)}
          bytes={pick(stats, 'n_bytes_bitset_containers', pi, ni)}
        />
        <tr className="stats-table__total">
          <th scope="row">Total</th>
          <td>{fmtCount(pick(stats, 'n_containers', pi, ni))}</td>
          <td>
            {fmtCount(
              (pick(stats, 'n_values_array_containers', pi, ni) ?? 0) +
                (pick(stats, 'n_values_run_containers', pi, ni) ?? 0) +
                (pick(stats, 'n_values_bitset_containers', pi, ni) ?? 0),
            )}
          </td>
          <td>
            {fmtMaybeBytes(
              (pick(stats, 'n_bytes_array_containers', pi, ni) ?? 0) +
                (pick(stats, 'n_bytes_run_containers', pi, ni) ?? 0) +
                (pick(stats, 'n_bytes_bitset_containers', pi, ni) ?? 0),
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function SizeProfileStats({ scenario, selected }: Props) {
  if (!selected) {
    return (
      <div className="stats-panel stats-panel--empty">
        <p className="stats-panel__hint">
          Click a data point on the 3D plot to inspect its detailed statistics.
        </p>
      </div>
    );
  }

  const { pi, ni } = selected;
  const nValue = scenario.n[ni];
  const pValue = scenario.p[pi];
  const card = scenario.cardinality[pi]?.[ni];

  const optBytes = scenario.optBytes[pi]?.[ni];
  const unoptBytes = scenario.unoptBytes[pi]?.[ni];

  return (
    <div className="stats-panel stats-panel--stacked">
      <div className="stats-panel__header">
        <div className="stats-panel__headings">
          <h3 className="stats-panel__title">Selected Data Point</h3>
          <p className="stats-panel__subtitle">
            Averaged across repetitions. Optimization refers to calling
            .optimize() after build.
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
            <dd>{card != null ? Math.round(card).toLocaleString() : '—'}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Pre-Optimization Size</dt>
            <dd>{unoptBytes != null ? fmtBytes(unoptBytes) : '—'}</dd>
          </div>
          <div className="stats-summary__item">
            <dt>Post-Optimization Size</dt>
            <dd>{optBytes != null ? fmtBytes(optBytes) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="stats-panel__grid">
        <section className="stats-block">
          <h4 className="stats-block__title">Pre-Optimization</h4>
          <StatsTable stats={scenario.unoptStats} pi={pi} ni={ni} />
        </section>
        <section className="stats-block">
          <h4 className="stats-block__title">Post-Optimization</h4>
          <StatsTable stats={scenario.optStats} pi={pi} ni={ni} />
        </section>
      </div>
    </div>
  );
}
