import { useEffect, useState } from 'react';
import { INVERTED_INDEX_SCENARIOS } from '../data/invertedIndex';
import { InvertedIndexPlot } from './viz/InvertedIndexPlot';
import { InvertedIndexStats } from './viz/InvertedIndexStats';
import { PlotZScaleToggle, type ZScale } from './viz/PlotZScaleToggle';
import { BenchEnvFootnote } from './viz/BenchEnvFootnote';
import {
  getInitialQuery,
  parseIntParam,
  pickEnum,
  updateQuery,
} from '../lib/queryState';

const SCENARIO_IDS = INVERTED_INDEX_SCENARIOS.map((s) => s.id);

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

export function InvertedIndexSize() {
  const q = getInitialQuery();
  const [scenarioId, setScenarioId] = useState<string>(() =>
    pickEnum(
      q.get('scenario'),
      SCENARIO_IDS,
      INVERTED_INDEX_SCENARIOS[0].id,
    ),
  );
  const [zScale, setZScale] = useState<ZScale>(() =>
    pickEnum(q.get('z'), ['linear', 'log'] as const, 'log'),
  );
  const scenario =
    INVERTED_INDEX_SCENARIOS.find((s) => s.id === scenarioId) ??
    INVERTED_INDEX_SCENARIOS[0];
  const [selected, setSelected] = useState<{ ci: number; ni: number } | null>(
    () => {
      const ci = parseIntParam(q, 'ci', 0, scenario.c.length - 1);
      const ni = parseIntParam(q, 'ni', 0, scenario.n.length - 1);
      return ci != null && ni != null ? { ci, ni } : null;
    },
  );

  useEffect(() => {
    updateQuery({
      scenario:
        scenarioId === INVERTED_INDEX_SCENARIOS[0].id ? null : scenarioId,
      z: zScale === 'log' ? null : zScale,
      ci: selected ? String(selected.ci) : null,
      ni: selected ? String(selected.ni) : null,
    });
  }, [scenarioId, zScale, selected]);

  return (
    <>
    <section className="panel">
      <div className="panel__header">
        <div className="panel__heading">
          <h2 className="panel__title">
            Inverted-index total bitmaps size profile
          </h2>
          <p className="panel__description">
            Total storage for an inverted index (one bitmap per unique value)
            over a record list, across list length and value
            cardinality (both log scale), by input distribution.
          </p>
        </div>
        <div className="scenario-bar">
          <div
            className="scenario-picker"
            role="radiogroup"
            aria-label="Scenario"
          >
            {INVERTED_INDEX_SCENARIOS.map((s) => {
              const isActive = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={isActive}
                  className={`scenario-picker__option${
                    isActive ? ' scenario-picker__option--active' : ''
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
          <InvertedIndexPlot
            scenario={scenario}
            zScale={zScale}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <InvertedIndexStats scenario={scenario} selected={selected} />
      </div>
    </section>
    <BenchEnvFootnote />
    </>
  );
}
