import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { ScenarioGrid, Grid } from '../../data/sizeBench';
import type { ZScale } from './PlotZScaleToggle';

interface Props {
  scenario: ScenarioGrid;
  zScale: ZScale;
  /** Currently selected (pi, ni) indices into the scenario's full grid, or null. */
  selected: { pi: number; ni: number } | null;
  onSelect: (indices: { pi: number; ni: number } | null) => void;
}

// Tick targets we want labelled on the log-spaced axes. We label aggressively
// (every 1/2/5 point across each decade) so readers can pinpoint values; Plotly
// will still drop labels that truly overlap at small viewport sizes.
const N_TICK_VALUES = [
  5e5,
  1e6, 2e6, 5e6,
  1e7, 2e7, 5e7,
  1e8, 2e8, 5e8,
  1e9,
];
const N_TICK_LABELS = [
  '500 K',
  '1 M', '2 M', '5 M',
  '10 M', '20 M', '50 M',
  '100 M', '200 M', '500 M',
  '1 B',
];

const P_TICK_VALUES = [
  1e-4, 2e-4, 5e-4,
  1e-3, 2e-3, 5e-3,
  1e-2, 2e-2, 5e-2,
  1e-1, 2e-1, 5e-1,
  1,
];
const P_TICK_LABELS = [
  '0.01 %', '0.02 %', '0.05 %',
  '0.1 %', '0.2 %', '0.5 %',
  '1 %', '2 %', '5 %',
  '10 %', '20 %', '50 %',
  '100 %',
];

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

// Shorter base-2 formatter for tick labels — integer coefficients where
// possible so the axis stays easy to scan.
function fmtBytesTick(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KiB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MiB`;
  return `${Math.round(bytes / 1024 ** 3)} GiB`;
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

// Generate ~9 evenly spaced tick values from 0 up to (and a bit past) the
// given max, snapped to a "nice" step so labels land on round byte counts.
function linearByteTicks(zMax: number): { values: number[]; labels: string[] } {
  if (!isFinite(zMax) || zMax <= 0) return { values: [0], labels: ['0 B'] };
  const targetTicks = 14;
  const rawStep = zMax / targetTicks;
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * base);
  const step = candidates.find((c) => c >= rawStep) ?? candidates[candidates.length - 1];
  const values: number[] = [];
  for (let v = 0; v <= zMax + step / 2; v += step) values.push(v);
  return { values, labels: values.map(fmtBytesTick) };
}

// Log-spaced tick values over the full range of measured bytes. The z axis
// stays `type: 'linear'` but carries pre-log10-transformed values, mirroring
// how the x and y axes already work, so tick labels line up exactly with the
// input decade steps.
function logByteTicks(
  zMin: number,
  zMax: number,
): { values: number[]; labels: string[] } {
  if (!isFinite(zMax) || zMax <= 0 || zMin <= 0) {
    return { values: [0], labels: ['0 B'] };
  }
  const minExp = Math.floor(Math.log10(zMin));
  const maxExp = Math.ceil(Math.log10(zMax));
  const values: number[] = [];
  for (let e = minExp; e <= maxExp; e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= zMin * 0.5 && v <= zMax * 2) values.push(v);
    }
  }
  return { values, labels: values.map(fmtBytesTick) };
}

interface SeriesDef {
  label: string;
  grid: Grid;
  surfaceColors: [number, string][];
  scatterColors: [number, string][];
  /** Whether this series owns the (shared) colorbar. Only one series should. */
  showColorbar: boolean;
}

export function SizeProfilePlot({ scenario, zScale, selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Hold the latest onSelect in a ref so the plot-rebuild effect doesn't
  // depend on callback identity.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Map scatter pointNumber -> (pi, ni) in the scenario grid. Populated by the
  // plot-build effect; read by the click handler and the highlight effect.
  const pointIndexRef = useRef<{ pi: number[]; ni: number[] }>({ pi: [], ni: [] });
  // Trace indices of the scatter overlays so restyle/click handlers know
  // which traces to touch. Filled during plot build.
  const scatterTracesRef = useRef<number[]>([]);
  // Mirror of the grid coordinates used for nearest-neighbor snapping when
  // the user clicks anywhere on the surface. `xLog` is the clipped axis
  // (starting at nStartIdx in `scenario.n`), so the click handler must
  // translate scenario.n indices back to clipped indices via `nStartIdx`.
  const gridRef = useRef<{ xLog: number[]; yLog: number[]; nStartIdx: number }>(
    { xLog: [], yLog: [], nStartIdx: 0 },
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    // Smaller-universe data points aren't as informative, so we clip the plot
    // to n >= 500 K for every scenario.
    const N_MIN = 5e5;
    const nStartIdx = scenario.n.findIndex((v) => v >= N_MIN);
    const nVals = scenario.n.slice(nStartIdx);

    const sliceGrid = (g: Grid): Grid => g.map((row) => row.slice(nStartIdx));

    // Shared color scheme — same as the original roaring plot — so the
    // visual language stays consistent across scenarios.
    const SURFACE_COLORS: [number, string][] = [
      [0.0, '#1e2a4a'],
      [0.25, '#2b4a8a'],
      [0.5, '#7aa2ff'],
      [0.75, '#e9b44c'],
      [1.0, '#d46a6a'],
    ];
    const SCATTER_COLORS: [number, string][] = [
      [0.0, '#4da3ff'],
      [0.25, '#7fd6ff'],
      [0.5, '#b8f29a'],
      [0.75, '#ffd24d'],
      [1.0, '#ff5a5a'],
    ];

    const series: SeriesDef[] = [
      {
        label: 'Roaring optimized',
        grid: sliceGrid(scenario.optBytes),
        surfaceColors: SURFACE_COLORS,
        scatterColors: SCATTER_COLORS,
        showColorbar: true,
      },
    ];

    // Plotly's 3D surface doesn't animate log axes well for data that spans
    // many decades, so we plot log10(n) and log10(p) directly and format the
    // tick labels back to the original scale.
    const xLog = nVals.map((v) => Math.log10(v));
    const yLog = scenario.p.map((v) => Math.log10(v));

    // Flat lists for the scatter overlays. The (pi, ni) index map is shared
    // across series since all series share the scenario grid.
    const pointPi: number[] = [];
    const pointNi: number[] = [];
    let indexMapSeeded = false;

    const seriesScatter = series.map((s) => {
      const sx: number[] = [];
      const sy: number[] = [];
      const sz: number[] = [];
      const text: string[] = [];
      for (let pi = 0; pi < scenario.p.length; pi++) {
        for (let ni = 0; ni < nVals.length; ni++) {
          const z = s.grid[pi][ni];
          if (z == null) continue;
          const fullNi = ni + nStartIdx;
          const card = scenario.cardinality[pi][fullNi];
          sx.push(xLog[ni]);
          sy.push(yLog[pi]);
          sz.push(z);
          if (!indexMapSeeded) {
            pointPi.push(pi);
            pointNi.push(fullNi);
          }
          const zLabel = fmtBytes(z);
          text.push(
            `<b>${s.label}: ${zLabel}</b><br>` +
              `Universe n = ${fmtUniverse(nVals[ni])}<br>` +
              `Density% p = ${fmtPercent(scenario.p[pi])}<br>` +
              `Cardinality ≈ ${card != null ? card.toLocaleString() : '—'}`,
          );
        }
      }
      indexMapSeeded = true;
      return { sx, sy, sz, text };
    });
    pointIndexRef.current = { pi: pointPi, ni: pointNi };
    gridRef.current = { xLog, yLog, nStartIdx };

    // Z-axis tick range covers all series so the legend/colorbar scales
    // consistently across overlaid surfaces.
    const allZRaw = seriesScatter.flatMap((s) => s.sz);
    const zMaxRaw = allZRaw.length > 0 ? Math.max(...allZRaw) : 0;
    const zMinRawPos = allZRaw.reduce(
      (m, v) => (v > 0 && v < m ? v : m),
      Number.POSITIVE_INFINITY,
    );

    // Log mode for the z axis uses log10 directly on the strictly-positive
    // byte values, keeping the z axis `type: 'linear'` with pre-transformed
    // tick positions, mirroring how x and y work.
    const logActive = zScale === 'log';
    const useLogPos = logActive && isFinite(zMinRawPos);
    const logZ = (v: number | null) =>
      v != null && v > 0 ? Math.log10(v) : null;
    const displaySeries = useLogPos
      ? series.map((s) => ({
          ...s,
          grid: s.grid.map((row) => row.map(logZ)) as Grid,
        }))
      : series;
    const displaySeriesScatter = useLogPos
      ? seriesScatter.map((s) => ({
          ...s,
          sz: s.sz.map((v) => Math.log10(v)),
        }))
      : seriesScatter;

    const zTicks = useLogPos
      ? logByteTicks(zMinRawPos, zMaxRaw)
      : linearByteTicks(zMaxRaw);
    const zTickVals = useLogPos
      ? zTicks.values.map((v) => Math.log10(v))
      : zTicks.values;
    const zTickText = zTicks.labels;
    const { cmin, cmax } = {
      cmin: useLogPos
        ? Math.log10(Math.max(zMinRawPos, Number.MIN_VALUE))
        : 0,
      cmax: useLogPos
        ? Math.log10(Math.max(zMaxRaw, 1))
        : Math.max(zMaxRaw, 1),
    };

    // Pad the log-scaled input axes so the plotted surface sits inside the
    // axis box with visible breathing room on all sides. ~0.25 decades ≈ a
    // factor of ~1.78x on either end.
    const X_PAD = 0.25;
    const Y_PAD = 0.25;
    const xRange: [number, number] = [
      xLog[0] - X_PAD,
      xLog[xLog.length - 1] + X_PAD,
    ];
    const yRange: [number, number] = [
      yLog[0] - Y_PAD,
      yLog[yLog.length - 1] + Y_PAD,
    ];

    // Build trace list: for each series, push surface then scatter. Record
    // the scatter trace indices for later restyle/click routing.
    const data: unknown[] = [];
    const scatterTraces: number[] = [];
    for (let i = 0; i < displaySeries.length; i++) {
      const s = displaySeries[i];
      const { sx, sy, sz, text } = displaySeriesScatter[i];
      data.push({
        type: 'surface',
        x: xLog,
        y: yLog,
        z: s.grid,
        name: s.label,
        colorscale: s.surfaceColors,
        opacity: 0.85,
        showscale: s.showColorbar,
        colorbar: s.showColorbar
          ? {
              tickfont: { color: '#aab3c0', size: 13 },
              len: 0.6,
              thickness: 12,
              outlinewidth: 0,
              x: 0.98,
              tickmode: 'array',
              tickvals: zTickVals,
              ticktext: zTickText,
            }
          : undefined,
        contours: {
          z: {
            show: true,
            usecolormap: true,
            project: { z: true },
            width: 2,
          },
        },
        // 'none' suppresses the surface's own tooltip (we'd rather users see
        // the scatter tooltip) while still letting click events reach our
        // handler. 'skip' would swallow both, preventing surface clicks from
        // ever firing plotly_click — which is why a click on empty surface
        // appeared to do nothing before.
        hoverinfo: 'none',
      });
      scatterTraces.push(data.length);
      data.push({
        type: 'scatter3d',
        mode: 'markers',
        x: sx,
        y: sy,
        z: sz,
        text,
        hovertemplate: '%{text}<extra></extra>',
        hoverlabel: {
          bgcolor: '#171b21',
          bordercolor: '#323a45',
          font: { color: '#e8ecf1', size: 16 },
          namelength: -1,
          align: 'left',
        },
        marker: {
          size: sz.map(() => 10.5),
          color: sz,
          colorscale: s.scatterColors,
          cmin,
          cmax,
          showscale: false,
          line: {
            color: sz.map(() => '#0b0d10'),
            width: sz.map(() => 0.5),
          },
        },
        name: `${s.label} samples`,
        showlegend: false,
      });
    }
    scatterTracesRef.current = scatterTraces;

    const axisTitleFont = { size: 18, color: '#c7cdd6' };
    const axisTickFont = { size: 13, color: '#aab3c0' };

    const layout = {
      autosize: true,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#aab3c0', family: 'ui-sans-serif, system-ui, sans-serif' },
      scene: {
        xaxis: {
          title: { text: 'Universe Size (n)', font: axisTitleFont },
          tickvals: N_TICK_VALUES.map((v) => Math.log10(v)),
          ticktext: N_TICK_LABELS,
          tickfont: axisTickFont,
          gridcolor: '#2a323d',
          zerolinecolor: '#2a323d',
          color: '#aab3c0',
          backgroundcolor: 'rgba(17, 20, 24, 0.6)',
          showbackground: true,
          range: xRange,
          autorange: false,
        },
        yaxis: {
          title: { text: 'Density % (p)', font: axisTitleFont },
          tickvals: P_TICK_VALUES.map((v) => Math.log10(v)),
          ticktext: P_TICK_LABELS,
          tickfont: axisTickFont,
          gridcolor: '#2a323d',
          zerolinecolor: '#2a323d',
          color: '#aab3c0',
          backgroundcolor: 'rgba(17, 20, 24, 0.6)',
          showbackground: true,
          range: yRange,
          autorange: false,
        },
        zaxis: {
          title: {
            text: 'Bitmap Size',
            font: axisTitleFont,
          },
          type: 'linear',
          tickfont: axisTickFont,
          tickmode: 'array',
          tickvals: zTickVals,
          ticktext: zTickText,
          ticks: 'outside',
          gridcolor: '#2a323d',
          zerolinecolor: '#2a323d',
          color: '#aab3c0',
          backgroundcolor: 'rgba(17, 20, 24, 0.6)',
          showbackground: true,
        },
        camera: {
          // Reader-friendly default: looking in at the front-right corner with
          // mild elevation so the surface rises away from the viewer. `center`
          // is pulled down so the object sits higher in the viewport.
          eye: { x: 2.1, y: -2.35, z: 1.3 },
          center: { x: 0, y: 0, z: -0.15 },
        },
        // Stretch the two input axes (universe, cardinality) wider while
        // giving the output axis (bitmap size) a modest extra height so data
        // points spread out and are easier to read.
        aspectmode: 'manual',
        aspectratio: { x: 1.7, y: 1.7, z: 1.4 },
      },
    };

    const config = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['toImage', 'orbitRotation', 'resetCameraDefault3d'],
    };

    // Cast: we're assembling a heterogeneous list of surface + scatter3d
    // traces; plotly.js-dist-min's Data type doesn't describe the union
    // cleanly, so trust the shapes we constructed above.
    Plotly.newPlot(node, data as Parameters<typeof Plotly.newPlot>[1], layout, config);

    // Click handling. Plotly 3D's hit test almost always lands on the
    // surface before the scatter dots because the surface is bigger and
    // often closer to the camera, so we can't rely on "click lands on a
    // marker." Instead we accept clicks from either trace: we take the
    // click's (x, y) in scene-axis space (already in our log10(n)/log10(p)
    // coordinates), snap to the nearest *measured* grid cell, and select
    // that. A second click on the currently-selected cell clears the
    // selection.
    const plotNode = node as unknown as {
      on: (
        event: string,
        cb: (e: {
          points?: { curveNumber: number; pointNumber: number; x?: number; y?: number }[];
        }) => void,
      ) => void;
    };
    plotNode.on('plotly_click', (ev) => {
      const pt = ev.points?.[0];
      if (!pt) return;
      const { xLog: xs, yLog: ys, nStartIdx: nStart } = gridRef.current;
      const { pi: piArr, ni: niArr } = pointIndexRef.current;
      const total = piArr.length;
      if (total === 0) return;

      // If the click is on a scatter marker, Plotly gives us a pointNumber
      // directly — use it.
      let chosenPi: number | null = null;
      let chosenNi: number | null = null;
      if (
        scatterTracesRef.current.includes(pt.curveNumber) &&
        pt.pointNumber != null
      ) {
        const idx = pt.pointNumber;
        chosenPi = piArr[idx] ?? null;
        chosenNi = niArr[idx] ?? null;
      } else if (pt.x != null && pt.y != null) {
        // Otherwise snap to the nearest measured cell in log-space.
        const cx = pt.x;
        const cy = pt.y;
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < total; i++) {
          // niArr stores `fullNi` (index into scenario.n); xs is the clipped
          // axis, so translate via nStartIdx.
          const dx = xs[niArr[i] - nStart] - cx;
          const dy = ys[piArr[i]] - cy;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          chosenPi = piArr[bestIdx];
          chosenNi = niArr[bestIdx];
        }
      }
      if (chosenPi == null || chosenNi == null) return;
      onSelectRef.current({ pi: chosenPi, ni: chosenNi });
    });
    // Anywhere in the plot is a potential click target now, so show the
    // pointer cursor whenever the user is hovering over plot geometry.
    plotNode.on('plotly_hover', () => {
      node.style.cursor = 'pointer';
    });
    plotNode.on('plotly_unhover', () => {
      node.style.cursor = '';
    });

    const handleResize = () => Plotly.Plots.resize(node);
    window.addEventListener('resize', handleResize);

    // A late-loading stylesheet can shift our container's measured size after
    // Plotly has already sized itself, leaving the colorbar misplaced. A
    // ResizeObserver on the container catches those late changes so Plotly
    // re-measures and re-positions the colorbar correctly.
    const ro = new ResizeObserver(() => Plotly.Plots.resize(node));
    ro.observe(node);

    // Also schedule a resize on the next frame and after a short delay to
    // cover the race where CSS loads just after our first paint.
    const raf = requestAnimationFrame(() => Plotly.Plots.resize(node));
    const delayed = window.setTimeout(() => Plotly.Plots.resize(node), 250);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(delayed);
      Plotly.purge(node);
    };
  }, [scenario, zScale]);

  // Update selection-highlight styling (marker size + outline) without
  // rebuilding the plot — this preserves the user's camera angle.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const { pi: piArr, ni: niArr } = pointIndexRef.current;
    const total = piArr.length;
    if (total === 0) return;

    let selectedIdx = -1;
    if (selected) {
      for (let i = 0; i < total; i++) {
        if (piArr[i] === selected.pi && niArr[i] === selected.ni) {
          selectedIdx = i;
          break;
        }
      }
    }

    const sizes = new Array(total).fill(10.5);
    const lineColors = new Array(total).fill('#0b0d10');
    const lineWidths = new Array(total).fill(0.5);
    if (selectedIdx >= 0) {
      // Larger marker + thick, bright ring so the selection is unambiguous
      // even from a tilted camera angle.
      sizes[selectedIdx] = 18;
      lineColors[selectedIdx] = '#ffffff';
      lineWidths[selectedIdx] = 5;
    }

    // All scatter overlays share the same (pi, ni) index mapping, so apply
    // the selection styling to every scatter trace in the plot.
    const scatterTraces = scatterTracesRef.current;
    if (scatterTraces.length === 0) return;
    const P = Plotly as unknown as {
      restyle: (
        n: HTMLElement,
        update: Record<string, unknown[]>,
        traces: number[],
      ) => void;
    };
    P.restyle(
      node,
      {
        'marker.size': scatterTraces.map(() => sizes),
        'marker.line.color': scatterTraces.map(() => lineColors),
        'marker.line.width': scatterTraces.map(() => lineWidths),
      },
      scatterTraces,
    );
  }, [selected, scenario, zScale]);

  return <div ref={containerRef} className="plot3d" />;
}
