import { lazy, Suspense, useEffect, useState } from 'react';
import { RoaringStructure } from './tabs/RoaringStructure';
import {
  getInitialQuery,
  pickEnum,
  updateQuery,
} from './lib/queryState';
import './styles.css';

const BitmapSizeProfile = lazy(() =>
  import('./tabs/BitmapSizeProfile').then((m) => ({
    default: m.BitmapSizeProfile,
  })),
);

const InvertedIndexSize = lazy(() =>
  import('./tabs/InvertedIndexSize').then((m) => ({
    default: m.InvertedIndexSize,
  })),
);

const OperatorLatency = lazy(() =>
  import('./tabs/OperatorLatency').then((m) => ({
    default: m.OperatorLatency,
  })),
);

const OperationLookup = lazy(() =>
  import('./tabs/OperationLookup').then((m) => ({
    default: m.OperationLookup,
  })),
);

export type TabId =
  | 'structure'
  | 'size-profile'
  | 'inverted-index-size'
  | 'operator-latency'
  | 'bit-lookup-latency';

const TAB_IDS: readonly TabId[] = [
  'structure',
  'size-profile',
  'inverted-index-size',
  'operator-latency',
  'bit-lookup-latency',
] as const;

interface Tab {
  id: TabId;
  label: string;
  render: () => JSX.Element;
}

const TABS: Tab[] = [
  {
    id: 'structure',
    label: 'Data Structures',
    render: () => <RoaringStructure />,
  },
  {
    id: 'size-profile',
    label: 'Bitmap Size Profile',
    render: () => (
      <Suspense fallback={<div className="plot3d plot3d--loading">Loading…</div>}>
        <BitmapSizeProfile />
      </Suspense>
    ),
  },
  {
    id: 'inverted-index-size',
    label: 'Inverted Index Size',
    render: () => (
      <Suspense fallback={<div className="plot3d plot3d--loading">Loading…</div>}>
        <InvertedIndexSize />
      </Suspense>
    ),
  },
  {
    id: 'operator-latency',
    label: 'Merge Ops Latency',
    render: () => (
      <Suspense fallback={<div className="plot3d plot3d--loading">Loading…</div>}>
        <OperatorLatency />
      </Suspense>
    ),
  },
  {
    id: 'bit-lookup-latency',
    label: 'Bit Lookup Latency',
    render: () => (
      <Suspense fallback={<div className="plot3d plot3d--loading">Loading…</div>}>
        <OperationLookup />
      </Suspense>
    ),
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    pickEnum(getInitialQuery().get('tab'), TAB_IDS, 'structure'),
  );
  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  // Mirror the active tab into `?tab=…`. The default ("structure") is
  // omitted so a bare URL stays clean.
  useEffect(() => {
    updateQuery({ tab: activeTab === 'structure' ? null : activeTab });
  }, [activeTab]);

  // Switching tabs should also clear tab-specific query params so stale
  // selections don't leak across views. Shared between the tab bar and the
  // "home" click on the title.
  const goToTab = (id: TabId) => {
    if (id === activeTab) return;
    updateQuery({
      scenario: null,
      dist: null,
      op: null,
      kind: null,
      z: null,
      pi: null,
      ni: null,
      ci: null,
    });
    setActiveTab(id);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__heading">
            <h1 className="app-title">
              <button
                type="button"
                className="app-title__link"
                onClick={() => goToTab('structure')}
                aria-label="Go to Data Structures"
              >
                <img
                  src={`${import.meta.env.BASE_URL}favicon.svg`}
                  alt=""
                  aria-hidden="true"
                  className="app-title__icon"
                />
                Roaring Bitmap Visualization
              </button>
            </h1>
            <p className="app-subtitle">
              Roaring bitmap internals and benchmarking data profiles
            </p>
          </div>
          <nav className="app-links" aria-label="External links">
            <a
              className="app-links__link"
              href="https://roaringbitmap.org"
              target="_blank"
              rel="noreferrer"
              aria-label="Roaring Bitmap official website"
              title="Roaring Bitmap official website"
            >
              <svg
                viewBox="0 0 24 24"
                width="22.5"
                height="22.5"
                aria-hidden="true"
              >
                <text
                  x="12"
                  y="12"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="Georgia, 'Times New Roman', serif"
                  fontSize="20"
                  fontWeight="700"
                  fill="currentColor"
                >
                  R
                </text>
              </svg>
            </a>
            <a
              className="app-links__link"
              href="https://josehu.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Author's personal website"
              title="Author's personal website"
            >
              <svg
                viewBox="0 0 24 24"
                width="22.5"
                height="22.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9.5" />
                <path d="M2.5 12h19" />
                <path d="M12 2.5a15 15 0 0 1 0 19 15 15 0 0 1 0-19Z" />
              </svg>
            </a>
            <a
              className="app-links__link"
              href="https://github.com/josehu07/roaring-visual"
              target="_blank"
              rel="noreferrer"
              aria-label="Source code on GitHub"
              title="Source code on GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                width="20.5"
                height="20.5"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
              </svg>
            </a>
          </nav>
        </div>
      </header>

      <nav className="tab-bar" role="tablist" aria-label="Visualizations">
        <div className="tab-bar__inner">
          {TABS.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={selected}
                className={`tab${selected ? ' tab--active' : ''}`}
                onClick={() => goToTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="app-main" role="tabpanel">
        <div className="app-main__inner">{active.render()}</div>
      </main>
    </div>
  );
}
