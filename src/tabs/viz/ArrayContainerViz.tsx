const VALUES = [7, 12, 44, 91, 103, 218, 477, 812, 1290];

export function ArrayContainerViz() {
  const cell = 44;
  const gap = 4;
  const w = VALUES.length * cell + (VALUES.length - 1) * gap;
  const h = 40;

  return (
    <svg
      className="viz"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Array container: sorted list of 16-bit values"
    >
      {VALUES.map((v, i) => {
        const x = i * (cell + gap);
        return (
          <g key={i} transform={`translate(${x}, 0)`}>
            <rect
              x={0}
              y={0}
              width={cell}
              height={h}
              rx={6}
              className="viz-cell viz-cell--array"
            />
            <text
              x={cell / 2}
              y={h / 2 + 4}
              textAnchor="middle"
              className="viz-cell__text"
            >
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
