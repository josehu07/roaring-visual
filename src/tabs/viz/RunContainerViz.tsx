interface Run {
  start: number;
  length: number;
}

const RUNS: Run[] = [
  { start: 4, length: 18 },
  { start: 30, length: 42 },
  { start: 78, length: 8 },
  { start: 96, length: 28 },
];

const RANGE = 130;

export function RunContainerViz() {
  const trackH = 22;
  const labelH = 14;
  const padX = 8;
  const width = 520;
  const inner = width - padX * 2;
  const scale = (n: number) => padX + (n / RANGE) * inner;

  return (
    <svg
      className="viz"
      viewBox={`0 0 ${width} ${trackH + labelH + 6}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Run container: sorted (start, length) intervals"
    >
      <rect
        x={padX}
        y={0}
        width={inner}
        height={trackH}
        rx={4}
        className="viz-track"
      />
      {RUNS.map((r, i) => {
        const x = scale(r.start);
        const w = scale(r.start + r.length) - x;
        const cx = x + w / 2;
        return (
          <g key={i}>
            <rect
              x={x}
              y={0}
              width={w}
              height={trackH}
              rx={4}
              className="viz-run"
            />
            <text x={cx} y={trackH + labelH - 2} textAnchor="middle" className="viz-run-label">
              ({r.start},{r.length})
            </text>
          </g>
        );
      })}
    </svg>
  );
}
