import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { InvertedIndexScenarioGrid } from '../../data/invertedIndex';
import type { ZScale } from './PlotZScaleToggle';

interface Props {
  scenario: InvertedIndexScenarioGrid;
  zScale: ZScale;
  /** Currently selected (ci, ni) indices into the scenario's full grid, or null. */
  selected: { ci: number; ni: number } | null;
  onSelect: (indices: { ci: number; ni: number } | null) => void;
}

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

// The C (value cardinality %) axis spans 1e-9 to 0.1. Use a 1/2/5-per-decade
// tick pattern so readers can pinpoint values across 8 decades.
const C_TICK_VALUES = [
  1e-9, 2e-9, 5e-9,
  1e-8, 2e-8, 5e-8,
  1e-7, 2e-7, 5e-7,
  1e-6, 2e-6, 5e-6,
  1e-5, 2e-5, 5e-5,
  1e-4, 2e-4, 5e-4,
  1e-3, 2e-3, 5e-3,
  1e-2, 2e-2, 5e-2,
  1e-1, 2e-1, 5e-1,
  1,
];
const C_TICK_LABELS = [
  '1e-7 %', '2e-7 %', '5e-7 %',
  '1e-6 %', '2e-6 %', '5e-6 %',
  '1e-5 %', '2e-5 %', '5e-5 %',
  '0.0001 %', '0.0002 %', '0.0005 %',
  '0.001 %', '0.002 %', '0.005 %',
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
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TiB`;
}

function fmtBytesTick(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KiB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MiB`;
  if (bytes < 1024 ** 4) return `${Math.round(bytes / 1024 ** 3)} GiB`;
  return `${Math.round(bytes / 1024 ** 4)} TiB`;
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

export function InvertedIndexPlot({ scenario, zScale, selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const pointIndexRef = useRef<{ ci: number[]; ni: number[] }>({ ci: [], ni: [] });
  const gridRef = useRef<{ xLog: number[]; yLog: number[]; nStartIdx: number }>(
    { xLog: [], yLog: [], nStartIdx: 0 },
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    // Clip small universes like the primary plot.
    const N_MIN = 5e5;
    const nStartIdx = scenario.n.findIndex((v) => v >= N_MIN);
    const nVals = scenario.n.slice(nStartIdx);
    const totalBytes = scenario.totalBytes.map((row) => row.slice(nStartIdx));

    // Log-space the input axes so surface interpolation is evenly sampled.
    const xLog = nVals.map((v) => Math.log10(v));
    const yLog = scenario.c.map((v) => Math.log10(v));

    // Flat lists for the scatter overlay.
    const sx: number[] = [];
    const sy: number[] = [];
    const sz: number[] = [];
    const text: string[] = [];
    const pointCi: number[] = [];
    const pointNi: number[] = [];
    for (let ci = 0; ci < scenario.c.length; ci++) {
      for (let ni = 0; ni < nVals.length; ni++) {
        const z = totalBytes[ci][ni];
        if (z == null) continue;
        const fullNi = ni + nStartIdx;
        const nb = scenario.numBitmaps[ci][fullNi];
        const kb = scenario.kPerBitmap[ci][fullNi];
        sx.push(xLog[ni]);
        sy.push(yLog[ci]);
        sz.push(z);
        pointCi.push(ci);
        pointNi.push(fullNi);
        const zLabel = fmtBytes(z);
        const zTitle = 'Total';
        text.push(
          `<b>${zTitle}: ${zLabel}</b><br>` +
            `List length n = ${fmtUniverse(nVals[ni])}<br>` +
            `Value cardinality c = ${fmtPercent(scenario.c[ci])}<br>` +
            `Bitmaps = ${nb != null ? nb.toLocaleString() : '—'}<br>` +
            `Bitmap density% ≈ ${kb != null && nVals[ni] > 0 ? fmtPercent(kb / nVals[ni]) : '—'}`,
        );
      }
    }
    pointIndexRef.current = { ci: pointCi, ni: pointNi };
    gridRef.current = { xLog, yLog, nStartIdx };

    const zMaxRaw = sz.length > 0 ? Math.max(...sz) : 0;
    const zMinRawPos = sz.reduce(
      (m, v) => (v > 0 && v < m ? v : m),
      Number.POSITIVE_INFINITY,
    );
    // Log mode uses plain log10 on the strictly-positive byte values. See
    // SizeProfilePlot for the shared rationale.
    const logActive = zScale === 'log';
    const useLogPos = logActive && isFinite(zMinRawPos);
    const logOrNull = (v: number | null): number | null =>
      v != null && v > 0 ? Math.log10(v) : null;
    const displayTotal = useLogPos
      ? totalBytes.map((row) => row.map(logOrNull))
      : totalBytes;
    const displaySz = useLogPos ? sz.map((v) => Math.log10(v)) : sz;
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

    const surfaceColorscale = [
      [0.0, '#1e2a4a'],
      [0.25, '#2b4a8a'],
      [0.5, '#7aa2ff'],
      [0.75, '#e9b44c'],
      [1.0, '#d46a6a'],
    ];
    const scatterColorscale = [
      [0.0, '#4da3ff'],
      [0.25, '#7fd6ff'],
      [0.5, '#b8f29a'],
      [0.75, '#ffd24d'],
      [1.0, '#ff5a5a'],
    ];

    const data = [
      {
        type: 'surface',
        x: xLog,
        y: yLog,
        z: displayTotal,
        name: 'Total bytes',
        colorscale: surfaceColorscale,
        opacity: 0.85,
        showscale: true,
        colorbar: {
          tickfont: { color: '#aab3c0', size: 13 },
          len: 0.6,
          thickness: 12,
          outlinewidth: 0,
          x: 0.98,
          tickmode: 'array',
          tickvals: zTickVals,
          ticktext: zTickText,
        },
        contours: {
          z: {
            show: true,
            usecolormap: true,
            project: { z: true },
            width: 2,
          },
        },
        hoverinfo: 'none',
      },
      {
        type: 'scatter3d',
        mode: 'markers',
        x: sx,
        y: sy,
        z: displaySz,
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
          size: displaySz.map(() => 10.5),
          color: displaySz,
          colorscale: scatterColorscale,
          cmin,
          cmax,
          showscale: false,
          line: {
            color: displaySz.map(() => '#0b0d10'),
            width: displaySz.map(() => 0.5),
          },
        },
        name: 'Samples',
        showlegend: false,
      },
    ];

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
          title: {
            text: 'Value Cardinality % (c)',
            font: axisTitleFont,
            // Push the title farther from the tick labels so the long 1e-X %
            // tick text doesn't collide with the axis name.
            standoff: 40,
          },
          tickvals: C_TICK_VALUES.map((v) => Math.log10(v)),
          ticktext: C_TICK_LABELS,
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
            text: 'Total Size',
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
          eye: { x: 2.1, y: -2.35, z: 1.3 },
          center: { x: 0, y: 0, z: -0.15 },
        },
        aspectmode: 'manual',
        aspectratio: { x: 1.7, y: 3.0, z: 1.4 },
      },
    };

    const config = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['toImage', 'orbitRotation', 'resetCameraDefault3d'],
    };

    Plotly.newPlot(node, data, layout, config);

    // Click anywhere on the plot (surface or marker) selects the nearest
    // measured cell in log-space; clicking the already-selected cell clears
    // the selection. See the SizeProfilePlot version for the rationale.
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
      const { ci: ciArr, ni: niArr } = pointIndexRef.current;
      const total = ciArr.length;
      if (total === 0) return;

      let chosenCi: number | null = null;
      let chosenNi: number | null = null;
      if (pt.curveNumber === 1 && pt.pointNumber != null) {
        chosenCi = ciArr[pt.pointNumber] ?? null;
        chosenNi = niArr[pt.pointNumber] ?? null;
      } else if (pt.x != null && pt.y != null) {
        const cx = pt.x;
        const cy = pt.y;
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < total; i++) {
          // niArr stores `fullNi` (index into scenario.n); xs is clipped, so
          // translate via nStartIdx.
          const dx = xs[niArr[i] - nStart] - cx;
          const dy = ys[ciArr[i]] - cy;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          chosenCi = ciArr[bestIdx];
          chosenNi = niArr[bestIdx];
        }
      }
      if (chosenCi == null || chosenNi == null) return;
      onSelectRef.current({ ci: chosenCi, ni: chosenNi });
    });
    plotNode.on('plotly_hover', () => {
      node.style.cursor = 'pointer';
    });
    plotNode.on('plotly_unhover', () => {
      node.style.cursor = '';
    });

    const handleResize = () => Plotly.Plots.resize(node);
    window.addEventListener('resize', handleResize);

    const ro = new ResizeObserver(() => Plotly.Plots.resize(node));
    ro.observe(node);

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

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const { ci: ciArr, ni: niArr } = pointIndexRef.current;
    const total = ciArr.length;
    if (total === 0) return;

    let selectedIdx = -1;
    if (selected) {
      for (let i = 0; i < total; i++) {
        if (ciArr[i] === selected.ci && niArr[i] === selected.ni) {
          selectedIdx = i;
          break;
        }
      }
    }

    const sizes = new Array(total).fill(10.5);
    const lineColors = new Array(total).fill('#0b0d10');
    const lineWidths = new Array(total).fill(0.5);
    if (selectedIdx >= 0) {
      sizes[selectedIdx] = 18;
      lineColors[selectedIdx] = '#ffffff';
      lineWidths[selectedIdx] = 5;
    }

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
        'marker.size': [sizes],
        'marker.line.color': [lineColors],
        'marker.line.width': [lineWidths],
      },
      [1],
    );
  }, [selected, scenario, zScale]);

  return <div ref={containerRef} className="plot3d" />;
}
