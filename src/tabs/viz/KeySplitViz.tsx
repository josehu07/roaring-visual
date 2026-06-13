export function KeySplitViz() {
  const high = '01001011 10100111';
  const low = '11000101 00010110';

  return (
    <div className="keysplit">
      <code className="keysplit__word">
        <span className="keysplit__bits keysplit__bits--high">{high}</span>
        <span className="keysplit__divider" aria-hidden />
        <span className="keysplit__bits keysplit__bits--low">{low}</span>
      </code>
      <div className="keysplit__labels">
        <div className="keysplit__label keysplit__label--high">
          <span className="keysplit__dot keysplit__dot--high" />
          high 16 — container key
        </div>
        <div className="keysplit__label keysplit__label--low">
          <span className="keysplit__dot keysplit__dot--low" />
          low 16 — value in chunk
        </div>
      </div>
    </div>
  );
}
