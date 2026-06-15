import { ArrayContainerViz } from './viz/ArrayContainerViz';
import { BitmapContainerViz } from './viz/BitmapContainerViz';
import { RunContainerViz } from './viz/RunContainerViz';
import { KeySplitViz } from './viz/KeySplitViz';
import { TopLevelIndexViz } from './viz/TopLevelIndexViz';

export function RoaringStructure() {
  return (
    <div className="doc">
      <section className="panel">
        <div className="panel__body">
          <p className="doc__definition">
            A <b>Roaring bitmap</b> is a sorted set of{' '}
            <code>u32</code> integers.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel__body">
          <h3 className="doc__step">1 · Split each 32-bit value</h3>
          <p className="doc__lede">
            The <b>high half</b> is a{' '}
            <span className="doc__key">container&nbsp;key</span> that picks
            which chunk, i.e., container, the number belongs to; the{' '}
            <b>low half</b> is the{' '}
            <span className="doc__value">value&nbsp;in&nbsp;chunk</span>.
          </p>
          <KeySplitViz />
        </div>
      </section>

      <section className="panel">
        <div className="panel__body">
          <h3 className="doc__step">2 · Pick the best encoding per container</h3>
          <p className="doc__lede">
            Each container holds up to{' '}
            <span className="doc__nowrap">65&nbsp;536</span> low-16 values.
            Roaring swaps between three layouts so every chunk pays close to
            its theoretic minimum.
          </p>
          <div className="doc__containers">
            <ContainerCard
              name="Array"
              size="2 B / value"
              rule="card ≤ 4096"
              viz={<ArrayContainerViz />}
            >
              sorted <code>Vec&lt;u16&gt;</code> · sparse
            </ContainerCard>

            <ContainerCard
              name="Bitmap"
              size="fixed 8 KiB"
              rule="card > 4096"
              viz={<BitmapContainerViz />}
            >
              <code>[u64; 1024]</code> · dense
            </ContainerCard>

            <ContainerCard
              name="Run"
              size="4 B / run"
              rule="wins on clusters"
              viz={<RunContainerViz />}
            >
              sorted <code>(start, length)</code> · clustered
            </ContainerCard>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__body">
          <h3 className="doc__step">3 · Sorted index of non-empty containers</h3>
          <p className="doc__lede">
            The top level is a sorted array of{' '}
            <span className="doc__key">container&nbsp;keys</span> — exactly
            the high-16 prefixes that have at least one value — each pointing
            at its chosen container. Lookup is a binary search over this
            typically-small list to find the container, followed by a fast
            lookup into the container.
          </p>
          <TopLevelIndexViz />
        </div>
      </section>

      <section className="panel">
        <div className="panel__body">
          <h3 className="doc__step">References</h3>
          <ul className="doc__refs">
            <li>
              <a
                className="doc__ref-link"
                href="https://roaringbitmap.org/"
                target="_blank"
                rel="noreferrer"
              >
                roaringbitmap.org
              </a>
              <span className="doc__ref-meta">
                — official project site, papers, and implementations in
                multiple languages.
              </span>
            </li>
            <li>
              <a
                className="doc__ref-link"
                href="https://crates.io/crates/roaring"
                target="_blank"
                rel="noreferrer"
              >
                crates.io/crates/roaring
              </a>
              <span className="doc__ref-meta">
                — the Rust <code>roaring</code> crate v0.11.4 used to produce
                benchmark results.
              </span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

interface ContainerCardProps {
  name: string;
  size: string;
  rule: string;
  viz: JSX.Element;
  children: React.ReactNode;
}

function ContainerCard({ name, size, rule, viz, children }: ContainerCardProps) {
  return (
    <article className="ccard">
      <header className="ccard__head">
        <h3 className="ccard__name">{name}</h3>
        <div className="ccard__meta">
          <span className="ccard__meta-value">{size}</span>
          <span className="ccard__meta-sep" aria-hidden>·</span>
          <span className="ccard__meta-value">{rule}</span>
        </div>
      </header>
      <div className="ccard__viz">{viz}</div>
      <div className="ccard__body">{children}</div>
    </article>
  );
}
