interface Entry {
  key: string;
  type: 'array' | 'bitmap' | 'run';
}

const ENTRIES: Entry[] = [
  { key: '0x0000', type: 'array' },
  { key: '0x0001', type: 'bitmap' },
  { key: '0x0047', type: 'run' },
  { key: '0x00A3', type: 'array' },
  { key: '0xFFFE', type: 'bitmap' },
];

export function TopLevelIndexViz() {
  return (
    <div className="tli">
      {ENTRIES.map((e) => (
        <div className="tli__row" key={e.key}>
          <code className="tli__key">{e.key}</code>
          <span className="tli__arrow" aria-hidden>→</span>
          <span className={`tli__pill tli__pill--${e.type}`}>{e.type}</span>
        </div>
      ))}
    </div>
  );
}
