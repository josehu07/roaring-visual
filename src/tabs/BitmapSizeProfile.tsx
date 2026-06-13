import { useEffect, useState } from 'react';
import { SIZE_BENCH_SCENARIOS } from '../data/sizeBench';
import { SizeProfilePlot } from './viz/SizeProfilePlot';
import { SizeProfileStats } from './viz/SizeProfileStats';
import { PlotZScaleToggle, type ZScale } from './viz/PlotZScaleToggle';
import { BenchEnvFootnote } from './viz/BenchEnvFootnote';
import {
  getInitialQuery,
  parseIntParam,
  pickEnum,
  updateQuery,
} from '../lib/queryState';

const SCENARIO_IDS = SIZE_BENCH_SCENARIOS.map((s) => s.id);

const SCENARIO_DESCRIPTIONS: Record<string, string> = {
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

export function BitmapSizeProfile() {
  const q = getInitialQuery();
  const [scenarioId, setScenarioId] = useState<string>(() =>
    pickEnum(q.get('scenario'), SCENARIO_IDS, SIZE_BENCH_SCENARIOS[0].id),
  );
  const [zScale, setZScale] = useState<ZScale>(() =>
    pickEnum(q.get('z'), ['linear', 'log'] as const, 'log'),
  );
  const scenario =
    SIZE_BENCH_SCENARIOS.find((s) => s.id === scenarioId) ??
    SIZE_BENCH_SCENARIOS[0];
  // Selected (pi, ni) cell in the current scenario, or null if nothing picked.
  // Cleared when the user switches scenarios since indices are scenario-local.
  const [selected, setSelected] = useState<{ pi: number; ni: number } | null>(
    () => {
      const pi = parseIntParam(q, 'pi', 0, scenario.p.length - 1);
      const ni = parseIntParam(q, 'ni', 0, scenario.n.length - 1);
      return pi != null && ni != null ? { pi, ni } : null;
    },
  );

  // Mirror state into the URL whenever anything user-visible changes.
  useEffect(() => {
    updateQuery({
      scenario: scenarioId === SIZE_BENCH_SCENARIOS[0].id ? null : scenarioId,
      z: zScale === 'log' ? null : zScale,
      pi: selected ? String(selected.pi) : null,
      ni: selected ? String(selected.ni) : null,
    });
  }, [scenarioId, zScale, selected]);

  return (
    <>
    <section className="panel">
      <div className="panel__header">
        <div className="panel__heading">
          <h2 className="panel__title">Optimized serialized bitmap size</h2>
          <p className="panel__description">
            Optimized serialized byte size of an individual bitmap across
            universe size and density (both log scale), by input distribution.
          </p>
        </div>
        <div className="scenario-bar">
          <div
            className="scenario-picker"
            role="radiogroup"
            aria-label="Scenario"
          >
            {SIZE_BENCH_SCENARIOS.map((s) => {
              const selected = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={selected}
                  className={`scenario-picker__option${
                    selected ? ' scenario-picker__option--active' : ''
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
          <p className="scenario-bar__description">
            {SCENARIO_DESCRIPTIONS[scenario.id] ?? ''}
          </p>
        </div>
      </div>
      <div className="panel__body panel__body--plot">
        <div className="plot3d-stage">
          <PlotZScaleToggle value={zScale} onChange={setZScale} />
          <SizeProfilePlot
            scenario={scenario}
            zScale={zScale}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <SizeProfileStats scenario={scenario} selected={selected} />
      </div>
    </section>
    <BenchEnvFootnote />
    </>
  );
}
