import { useEffect, useState } from 'react';
import { OperationLookupPlot } from './viz/OperationLookupPlot';
import { OperationLookupStats } from './viz/OperationLookupStats';
import { PlotZScaleToggle, type ZScale } from './viz/PlotZScaleToggle';
import { BenchEnvFootnote } from './viz/BenchEnvFootnote';
import {
  getInitialQuery,
  parseIntParam,
  pickEnum,
  updateQuery,
} from '../lib/queryState';

export type LookupScenarioId = 'hit' | 'miss';

interface LookupScenario {
  id: LookupScenarioId;
  label: string;
  description: string;
}

const LOOKUP_SCENARIOS: LookupScenario[] = [
  {
    id: 'hit',
    label: 'Needle Hit',
    description:
      'Lookup for a value that is known to be set in the bitmap — needle chosen uniformly randomly from universe.',
  },
  {
    id: 'miss',
    label: 'Needle Miss',
    description:
      'Lookup for a value that is known to be unset in the bitmap — needle chosen uniformly randomly from universe.',
  },
];

// Distribution scenarios mirror the other tabs so readers can compare lookup
// latency under the same input distributions. Kept local since data for this
// tab will be independent.
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
const SCENARIO_IDS = LOOKUP_SCENARIOS.map((s) => s.id);

export function OperationLookup() {
  const q = getInitialQuery();
  const [distId, setDistId] = useState<string>(() =>
    pickEnum(q.get('dist'), DIST_IDS, DIST_SCENARIOS[0].id),
  );
  const [scenarioId, setScenarioId] = useState<LookupScenarioId>(() =>
    pickEnum(q.get('scenario'), SCENARIO_IDS, LOOKUP_SCENARIOS[0].id),
  );
  const [zScale, setZScale] = useState<ZScale>(() =>
    pickEnum(q.get('z'), ['linear', 'log'] as const, 'log'),
  );
  const [selected, setSelected] = useState<{ pi: number; ni: number } | null>(
    () => {
      // Data axes come from the real lookup benchmark once it exists. For
      // now restore indices only when both are present and non-negative.
      const pi = parseIntParam(q, 'pi', 0, 1_000_000);
      const ni = parseIntParam(q, 'ni', 0, 1_000_000);
      return pi != null && ni != null ? { pi, ni } : null;
    },
  );

  const dist = DIST_SCENARIOS.find((d) => d.id === distId) ?? DIST_SCENARIOS[0];
  const scenario =
    LOOKUP_SCENARIOS.find((s) => s.id === scenarioId) ?? LOOKUP_SCENARIOS[0];

  useEffect(() => {
    updateQuery({
      dist: distId === DIST_SCENARIOS[0].id ? null : distId,
      scenario:
        scenarioId === LOOKUP_SCENARIOS[0].id ? null : scenarioId,
      z: zScale === 'log' ? null : zScale,
      pi: selected ? String(selected.pi) : null,
      ni: selected ? String(selected.ni) : null,
    });
  }, [distId, scenarioId, zScale, selected]);

  return (
    <>
    <section className="panel">
      <div className="panel__header">
        <div className="panel__heading">
          <h2 className="panel__title">Bit lookup operation latency</h2>
          <p className="panel__description">
            Single value lookup latency across universe size and density (both
            log scale), by input distribution and hit/miss scenario.
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
            aria-label="Lookup scenario"
          >
            {LOOKUP_SCENARIOS.map((s) => {
              const active = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={active}
                  className={`scenario-picker__option${
                    active ? ' scenario-picker__option--active' : ''
                  }`}
                  onClick={() => {
                    setScenarioId(s.id);
                    setSelected(null);
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="scenario-bar__description">{scenario.description}</p>
        </div>
      </div>
      <div className="panel__body panel__body--plot">
        <div className="plot3d-stage">
          <PlotZScaleToggle value={zScale} onChange={setZScale} />
          <OperationLookupPlot
            distId={dist.id}
            scenarioId={scenario.id}
            zScale={zScale}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <OperationLookupStats
          distId={dist.id}
          selected={selected}
        />
      </div>
    </section>
    <BenchEnvFootnote />
    </>
  );
}
