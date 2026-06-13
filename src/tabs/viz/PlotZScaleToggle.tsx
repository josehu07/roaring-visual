export type ZScale = 'linear' | 'log';

interface Props {
  value: ZScale;
  onChange: (next: ZScale) => void;
}

export function PlotZScaleToggle({ value, onChange }: Props) {
  return (
    <div className="plot3d-stage__toolbar" role="radiogroup" aria-label="Z axis scale">
      <span className="plot3d-stage__toolbar-label" aria-hidden>Z:</span>
      {(['linear', 'log'] as const).map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            className={`plot3d-stage__toggle${
              active ? ' plot3d-stage__toggle--active' : ''
            }`}
            onClick={() => onChange(s)}
          >
            {s === 'linear' ? 'Linear' : 'Log'}
          </button>
        );
      })}
    </div>
  );
}
