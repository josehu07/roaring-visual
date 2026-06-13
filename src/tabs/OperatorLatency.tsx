import { useEffect, useState } from 'react';
import { OperatorLatencyPlot } from './viz/OperatorLatencyPlot';
import { OperatorLatencyStats } from './viz/OperatorLatencyStats';
import { PlotZScaleToggle, type ZScale } from './viz/PlotZScaleToggle';
import { BenchEnvFootnote } from './viz/BenchEnvFootnote';
import { OPS_LATENCY_SCENARIOS } from '../data/opsLatency';
import {
  getInitialQuery,
  parseIntParam,
  pickEnum,
  updateQuery,
} from '../lib/queryState';

export type OpScenarioId =
  | 'intersect-similar'
  | 'intersect-small1'
  | 'union-similar'
  | 'union-small1'
  | 'diff-similar'
  | 'diff-small1';

interface OpScenario {
  id: OpScenarioId;
  label: string;
  description: string;
}

const OP_SCENARIOS: OpScenario[] = [
  {
    id: 'intersect-similar',
    label: 'Intersect (similar)',
    description: 'Intersection (A ∧ B) of two bitmaps drawn from the same distribution — second bitmap has similar density.',
  },
  {
    id: 'intersect-small1',
    label: 'Intersect (small 1%)',
    description: 'Intersection (A ∧ B) of two bitmaps drawn from the same distribution — second bitmap is 1% density of datapoint.',
  },
  {
    id: 'union-similar',
    label: 'Union (similar)',
    description: 'Union (A ∨ B) of two bitmaps drawn from the same distribution — second bitmap has similar density.',
  },
  {
    id: 'union-small1',
    label: 'Union (small 1%)',
    description: 'Union (A ∨ B) of two bitmaps drawn from the same distribution — second bitmap is 1% density of datapoint.',
  },
  {
    id: 'diff-similar',
    label: 'Diff (similar)',
    description: 'Difference (A − B) of two bitmaps drawn from the same distribution — second bitmap has similar density.',
  },
  {
    id: 'diff-small1',
    label: 'Diff (small 1%)',
    description: 'Difference (A − B) of two bitmaps drawn from the same distribution — second bitmap is 1% density of datapoint.',
  },
];

// Distribution scenarios mirror the other tabs so readers can compare
// operator latency under the same input distributions. Kept local (rather
// than imported from sizeBench) since data for this tab is independent.
const DIST_SCENARIOS = [
  { id: 'uniform',      label: 'Uniform' },
  { id: 'zipf-0.9',     label: 'Zipf (s=0.9)' },
  { id: 'zipf-1.0',     label: 'Zipf (s=1.0)' },
  { id: 'zipf-1.2',     label: 'Zipf (s=1.2)' },
  { id: 'block-c8',     label: 'Block (c=8)' },
  { id: 'block-c64',    label: 'Block (c=64)' },
  { id: 'block-c1024',  label: 'Block (c=1024)' },
];

const DIST_DESCRIPTIONS: Record<string, string> = {
  uniform:
    'Values drawn independently and uniformly at random across the universe — no clustering, no skew.',
  'zipf-0.9':
    'Zipf distribution with exponent s=0.9 — mildly skewed: a head of hot values appears more often, but the tail stays heavy.',
  'zipf-1.0':
    'Zipf distribution with exponent s=1.0 — classic "80/20"-style skew, with a clear heavy head and a long tail.',
  'zipf-1.2':
    'Zipf distribution with exponent s=1.2 — strongly skewed: a small hot set dominates and the tail thins out quickly.',
  'block-c8':
    'Block pattern clusters, each spanning 8 bits, around randomly chosen centroids — very tight, narrow clusters.',
  'block-c64':
    'Block pattern clusters, each spanning 64 bits, around randomly chosen centroids — small local clusters.',
  'block-c1024':
    'Block pattern clusters, each spanning 1024 bits, around randomly chosen centroids — wide runs of consecutive bits.',
};

const DIST_IDS = DIST_SCENARIOS.map((d) => d.id);
const OP_IDS = OP_SCENARIOS.map((o) => o.id);

export function OperatorLatency() {
  const q = getInitialQuery();
  const [distId, setDistId] = useState<string>(() =>
    pickEnum(q.get('dist'), DIST_IDS, DIST_SCENARIOS[0].id),
  );
  const [opId, setOpId] = useState<OpScenarioId>(() =>
    pickEnum(q.get('op'), OP_IDS, OP_SCENARIOS[0].id),
  );
  const [zScale, setZScale] = useState<ZScale>(() =>
    pickEnum(q.get('z'), ['linear', 'log'] as const, 'log'),
  );

  const dist = DIST_SCENARIOS.find((d) => d.id === distId) ?? DIST_SCENARIOS[0];
  const op = OP_SCENARIOS.find((o) => o.id === opId) ?? OP_SCENARIOS[0];
  const opsScenario = OPS_LATENCY_SCENARIOS.find((s) => s.id === dist.id);

  const [selected, setSelected] = useState<{ pi: number; ni: number } | null>(
    () => {
      if (!opsScenario) return null;
      const pi = parseIntParam(q, 'pi', 0, opsScenario.p.length - 1);
      const ni = parseIntParam(q, 'ni', 0, opsScenario.n.length - 1);
      return pi != null && ni != null ? { pi, ni } : null;
    },
  );

  useEffect(() => {
    updateQuery({
      dist: distId === DIST_SCENARIOS[0].id ? null : distId,
      op: opId === OP_SCENARIOS[0].id ? null : opId,
      z: zScale === 'log' ? null : zScale,
      pi: selected ? String(selected.pi) : null,
      ni: selected ? String(selected.ni) : null,
    });
  }, [distId, opId, zScale, selected]);

  return (
    <>
    <section className="panel">
      <div className="panel__header">
        <div className="panel__heading">
          <h2 className="panel__title">Bitmap merge operation latency</h2>
          <p className="panel__description">
            Bitmap logical operation latency across universe size and density
            (both log scale), by input distribution and operator scenario.
          </p>
        </div>
        <div className="scenario-bar">
          <div
            className="scenario-picker"
            role="radiogroup"
            aria-label="Distribution scenario"
          >
            {DIST_SCENARIOS.map((s) => {
              const active = s.id === distId;
              return (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={active}
                  className={`scenario-picker__option${
                    active ? ' scenario-picker__option--active' : ''
                  }`}
                  onClick={() => {
                    setDistId(s.id);
                    setSelected(null);
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="scenario-bar__description">
            {DIST_DESCRIPTIONS[dist.id] ?? ''}
          </p>
          <div
            className="scenario-picker scenario-picker--op"
            role="radiogroup"
            aria-label="Operator scenario"
          >
            {OP_SCENARIOS.map((s) => {
              const active = s.id === opId;
              return (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={active}
                  className={`scenario-picker__option${
                    active ? ' scenario-picker__option--active' : ''
                  }`}
                  onClick={() => {
                    setOpId(s.id);
                    setSelected(null);
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="scenario-bar__description">{op.description}</p>
        </div>
      </div>
      <div className="panel__body panel__body--plot">
        <div className="plot3d-stage">
          <PlotZScaleToggle value={zScale} onChange={setZScale} />
          <OperatorLatencyPlot
            distId={dist.id}
            opId={op.id}
            zScale={zScale}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <OperatorLatencyStats
          distId={dist.id}
          opId={op.id}
          selected={selected}
        />
      </div>
    </section>
    <BenchEnvFootnote />
    </>
  );
}
