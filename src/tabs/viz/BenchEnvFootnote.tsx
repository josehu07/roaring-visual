// Separate card shown at the bottom of every benchmark tab so readers know
// what hardware the numbers came from. Rendered as its own panel — same
// "sibling card" pattern as the References block on the Data Structures tab.
export function BenchEnvFootnote() {
  return (
    <section className="panel bench-env">
      <div className="panel__body bench-env__body">
        Benchmarking results run on an{' '}
        <a
          className="bench-env__link"
          href="https://aws.amazon.com/ec2/instance-types/m6a/"
          target="_blank"
          rel="noreferrer"
        >
          m6a.8xlarge
        </a>{' '}
        EC2 instance with Rust{' '}
        <a
          className="bench-env__link"
          href="https://crates.io/crates/roaring"
          target="_blank"
          rel="noreferrer"
        >
          roaring
        </a>{' '}
        crate.
      </div>
    </section>
  );
}
