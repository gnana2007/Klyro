"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { Brand } from "./brand";

function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={"site-header" + (scrolled ? " is-scrolled" : "")}>
      <div className="site-header-inner">
        <a href="/" aria-label="Klyro home">
          <Brand />
        </a>
        <button
          className="mobile-menu"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav
          className={open ? "site-nav is-open" : "site-nav"}
          aria-label="Site navigation"
        >
          <a href="#product" onClick={() => setOpen(false)}>
            Product
          </a>
          <a href="#workflow" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a
            href="https://github.com/gnana2007/Klyro#readme"
            target="_blank"
            rel="noreferrer"
          >
            Documentation <ExternalLink size={14} />
          </a>
          <a className="nav-launch" href="/app">
            Launch app <ArrowRight size={16} />
          </a>
        </nav>
      </div>
    </header>
  );
}

function InvestigationDiagram() {
  return (
    <div
      className="hero-diagram"
      role="img"
      aria-label="Hook contract connected to permission, implementation, evidence and historical-change layers"
    >
      <div className="diagram-coordinate">
        KLY / INVESTIGATION MAP <span>01—04</span>
      </div>
      <svg
        className="diagram-lines"
        viewBox="0 0 650 520"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M325 243 L135 114 M325 243 L518 106 M325 243 L535 375 M325 243 L150 388 M135 114 L518 106 M150 388 L535 375" />
        <path
          className="diagram-dashed"
          d="M325 243 L325 42 M325 243 L325 478"
        />
        <circle cx="325" cy="243" r="120" />
        <circle cx="325" cy="243" r="176" />
      </svg>
      <div className="diagram-core">
        <span>00 / CONTRACT</span>
        <strong>Hook</strong>
        <code>address input</code>
      </div>
      <div className="diagram-node diagram-node-a">
        <span>01</span>
        <strong>Permissions</strong>
        <small>14 address flags</small>
      </div>
      <div className="diagram-node diagram-node-b">
        <span>02</span>
        <strong>Implementation</strong>
        <small>code + proxy state</small>
      </div>
      <div className="diagram-node diagram-node-c">
        <span>03</span>
        <strong>Evidence</strong>
        <small>observed at block</small>
      </div>
      <div className="diagram-node diagram-node-d">
        <span>04</span>
        <strong>Change</strong>
        <small>previous → current</small>
      </div>
      <div className="diagram-caption">
        <span className="diagram-rule" />
        Every relationship has a source.
      </div>
    </div>
  );
}

const stages = [
  ["01", "Discover", "Enter a deployed hook address and choose its network."],
  [
    "02",
    "Investigate",
    "Decode permissions and inspect contract observations.",
  ],
  [
    "03",
    "Compare",
    "Identify changes across saved block-specific investigations.",
  ],
  [
    "04",
    "Preserve",
    "Generate a reproducible Hook Passport with its report hash.",
  ],
];

export default function Landing() {
  return (
    <div className="marketing">
      <SiteHeader />
      <main id="main">
        <section className="hero marketing-container">
          <div className="hero-copy">
            <p className="section-index">
              Uniswap v4 / Hook investigation workbench
            </p>
            <h1>Know what your hooks are capable of.</h1>
            <p className="hero-lead">
              Investigate Uniswap v4 hooks through permissions, implementation
              evidence and change-aware analysis. Understand what changed, and
              see exactly why it matters.
            </p>
            <div className="hero-actions">
              <a className="primary" href="/app?view=scanner">
                Investigate a hook <ArrowRight size={17} />
              </a>
              <a className="editorial-link" href="#workflow">
                Explore the workflow <ArrowDownRight size={17} />
              </a>
            </div>
            <p className="hero-disclaimer">
              Evidence for investigation. Never a safety certification.
            </p>
          </div>
          <InvestigationDiagram />
        </section>

        <section id="product" className="problem-section">
          <div className="marketing-container problem-grid">
            <div>
              <p className="section-index">The investigation</p>
              <h2>
                A hook’s address tells you where it lives. Not everything it can
                do.
              </h2>
            </div>
            <div className="problem-body">
              <p>
                Callbacks are only the beginning. Behavior depends on
                implementation, dependencies, supporting observations and what
                may have changed since the last scan.
              </p>
              <div
                className="progression"
                aria-label="Investigation progression"
              >
                {[
                  "Contract",
                  "Permissions",
                  "Implementation",
                  "Evidence",
                  "Changes",
                ].map((item, i) => (
                  <span key={item}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="marketing-section marketing-container"
        >
          <div className="section-heading">
            <p className="section-index">Method / 01—04</p>
            <h2>From address to accountable record.</h2>
            <p>Each step keeps the observation tied to its source and block.</p>
          </div>
          <div className="stage-grid">
            {stages.map(([number, title, description]) => (
              <article key={number}>
                <span>{number}</span>
                <div className="stage-line" />
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-plate marketing-container">
          <div className="feature-number">01 / PERMISSION INTELLIGENCE</div>
          <div className="feature-copy">
            <h2>
              Fourteen flags.
              <br />
              One clear picture.
            </h2>
            <p>
              See every Uniswap v4 callback permission, including return-delta
              capabilities, with the address bit and the observation behind it.
            </p>
            <a className="editorial-link" href="/app?view=scanner">
              Explore permissions <ArrowRight size={17} />
            </a>
          </div>
          <div className="permission-art" aria-hidden="true">
            <div>
              <span>beforeSwap</span>
              <b>ENABLED</b>
            </div>
            <div>
              <span>afterSwap</span>
              <b>ENABLED</b>
            </div>
            <div>
              <span>afterSwapReturnDelta</span>
              <b>ENABLED</b>
            </div>
            <div>
              <span>beforeDonate</span>
              <b>DISABLED</b>
            </div>
            <small>CONCEPT VIEW / NO CONTRACT LOADED</small>
          </div>
        </section>

        <section className="split-features marketing-container">
          <article className="feature-rule">
            <span className="feature-number">
              02 / EVIDENCE-LINKED FINDINGS
            </span>
            <h2>Claims you can trace.</h2>
            <p>
              Open a finding to inspect its source, detection method, block and
              limitations. Deterministic rules produce the findings; optional AI
              only explains them.
            </p>
            <div className="mini-evidence" aria-hidden="true">
              <span>Finding</span>
              <i />
              <span>Observation</span>
              <i />
              <span>Source</span>
            </div>
          </article>
          <article className="feature-rule">
            <span className="feature-number">03 / EVIDENCE GRAPH</span>
            <h2>Relationships, made inspectable.</h2>
            <p>
              Move between the hook, permissions, external candidates, findings
              and supporting evidence. Nodes open their actual recorded data.
            </p>
            <div className="mini-network" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </article>
        </section>

        <section className="comparison-feature">
          <div className="marketing-container comparison-inner">
            <div>
              <p className="section-index">The signature feature</p>
              <h2>Know precisely what changed.</h2>
              <p>
                Compare two saved observations of the same hook. Code, proxy
                implementation, owner, dependencies and findings are shown side
                by side. Unknowns stay unknown.
              </p>
              <a className="primary" href="/app?view=comparisons">
                Open comparisons <ArrowRight size={17} />
              </a>
            </div>
            <div className="comparison-art" aria-hidden="true">
              <div>
                <span>PREVIOUS SNAPSHOT</span>
                <code>earlier observed block</code>
                <p>
                  implementation
                  <br />
                  recorded value
                </p>
                <p>
                  source
                  <br />
                  observed status
                </p>
              </div>
              <div className="comparison-art-arrow">→</div>
              <div>
                <span>CURRENT SNAPSHOT</span>
                <code>later observed block</code>
                <p>
                  implementation
                  <br />
                  compared value
                </p>
                <p>
                  source
                  <br />
                  observed status
                </p>
              </div>
              <small>
                Concept diagram; open the workbench for actual comparisons.
              </small>
            </div>
          </div>
        </section>

        <section className="split-features marketing-container last-features">
          <article className="feature-rule">
            <span className="feature-number">05 / HOOK PASSPORTS</span>
            <h2>A report you can reproduce.</h2>
            <p>
              Preserve the observed block, permission configuration, findings,
              evidence and canonical hash. Check integrity separately from
              current contract state.
            </p>
          </article>
          <article className="feature-rule">
            <span className="feature-number">06 / VERIFIABLE REPORTING</span>
            <h2>
              Clear provenance.
              <br />
              Clear limits.
            </h2>
            <p>
              Local registry verification is implemented. Chainlink CRE workflow
              compilation is verified; authenticated runtime simulation remains
              pending.
            </p>
          </article>
        </section>

        <section className="integrations-section">
          <div className="marketing-container">
            <p className="section-index">System architecture</p>
            <h2>Purposeful layers. Separate responsibilities.</h2>
            <div className="integration-list">
              <article>
                <strong>Uniswap v4</strong>
                <p>
                  Core hook permissions, PoolManager context and local execution
                  evidence.
                </p>
                <span>Live read-only scans operational</span>
              </article>
              <article>
                <strong>Chainlink CRE</strong>
                <p>
                  Report validation and publication workflow, separate from
                  scanning.
                </p>
                <span>Compiled; authenticated simulation pending</span>
              </article>
              <article>
                <strong>0G</strong>
                <p>
                  Optional explanations of deterministic findings with provider
                  provenance.
                </p>
                <span>Requires account key and existing free credits</span>
              </article>
            </div>
          </div>
        </section>

        <section className="closing-section marketing-container">
          <p className="section-index">Begin with an address</p>
          <h2>
            Don’t just inspect a hook.
            <br />
            Understand its history.
          </h2>
          <a className="primary" href="/app?view=scanner">
            Start an investigation <ArrowRight size={17} />
          </a>
        </section>
      </main>
      <footer className="site-footer">
        <div className="marketing-container">
          <Brand />
          <p>
            Understand what your hooks can do. Know what has changed. Follow the
            evidence.
          </p>
          <div>
            <a href="/app">Workbench</a>
            <a
              href="https://github.com/gnana2007/Klyro"
              target="_blank"
              rel="noreferrer"
            >
              Source & documentation
            </a>
          </div>
          <small>Bounded investigation, not a safety certificate.</small>
        </div>
      </footer>
    </div>
  );
}
