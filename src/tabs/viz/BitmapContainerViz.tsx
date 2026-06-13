const COLS = 48;
const ROWS = 8;

// Deterministic pseudo-random mask that reads "dense" — roughly 55% filled.
function seeded(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => seeded(i) > 0.45);

export function BitmapContainerViz() {
  const cell = 12;
  const gap = 2;
  const w = COLS * cell + (COLS - 1) * gap;
  const h = ROWS * cell + (ROWS - 1) * gap;

  return (
    <svg
      className="viz"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Bitmap container: fixed array of 1024 u64 words, one bit per value"
    >
      {CELLS.map((on, i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const x = c * (cell + gap);
        const y = r * (cell + gap);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={cell}
            height={cell}
            rx={2}
            className={on ? 'viz-bit viz-bit--on' : 'viz-bit viz-bit--off'}
          />
        );
      })}
    </svg>
  );
}
