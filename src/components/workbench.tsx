"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Search,
  Fingerprint,
  GitCompareArrows,
  Network,
  FileCheck2,
  Copy,
  Check,
  ExternalLink,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import type { Snapshot, Diff, AIResult, EvidenceNode } from "@/core/types";
import PassportView from "./passport";
const chains = [
  { id: 1, name: "Ethereum" },
  { id: 11155111, name: "Sepolia" },
  { id: 8453, name: "Base" },
  { id: 31337, name: "Local Anvil" },
];
const short = (s: string) =>
  s.length > 24 ? s.slice(0, 12) + "…" + s.slice(-8) : s;
export async function api(path: string, data?: unknown) {
  const response = await fetch("/api/" + path, {
    ...(data !== undefined
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-operator-token": sessionStorage.getItem("hscan-operator") || "",
          },
          body: JSON.stringify(data),
        }
      : {}),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed");
  return value;
}
function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <code title={value}>{value}</code>
    </div>
  );
}
function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-button"
      title="Copy address"
      aria-label="Copy address"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}
export default function Workbench() {
  const [address, setAddress] = useState(""),
    [chainId, setChainId] = useState(1),
    [scan, setScan] = useState<Snapshot | null>(null),
    [jobId, setJobId] = useState<string | null>(null),
    [stage, setStage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selectedFinding, setSelectedFinding] = useState(""),
    [tab, setTab] = useState("overview"),
    [view, setView] = useState("scanner"),
    [scans, setScans] = useState<Snapshot[]>([]),
    [inference, setInference] = useState<AIResult | null>(null),
    [passport, setPassport] = useState<string | null>(null),
    [fixtureBusy, setFixtureBusy] = useState(false),
    [withAI, setWithAI] = useState(true),
    [health, setHealth] = useState<{
      inferenceConfigured: boolean;
      freeCreditsConfirmed: boolean;
    } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setView(q.get("view") || "scanner");
    setTab(q.get("tab") || "overview");
    const id = q.get("scan");
    if (id) setJobId(id);
    api("scans")
      .then(setScans)
      .catch(() => {});
    api("health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    async function poll() {
      try {
        const j = await api("scans/" + jobId);
        if (!active) return;
        setStage(j.stage);
        if (j.snapshot) {
          setScan(j.snapshot);
          setAddress(j.snapshot.address);
          setChainId(j.chainId);
          setInference(j.inference);
        }
        if (j.status === "failed") {
          setError(j.error);
          setBusy(false);
        } else if (j.status === "complete") {
          setBusy(false);
          api("scans").then(setScans);
        } else if (count++ < 180) timer = setTimeout(poll, 1000);
        else {
          setBusy(false);
          setError(
            "Scan is taking longer than expected. Its saved job can be reopened from this URL.",
          );
        }
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setBusy(false);
        }
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);
  function chooseTab(next: string) {
    setTab(next);
    const q = new URLSearchParams(location.search);
    q.set("tab", next);
    window.history.replaceState(null, "", "?" + q);
  }
  async function start(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    setStage("Submitting scan");
    setPassport(null);
    setScan(null);
    try {
      const j = await api("scans", {
        address,
        chainId,
        explain:
          withAI &&
          !!health?.inferenceConfigured &&
          !!health?.freeCreditsConfirmed,
      });
      setJobId(j.id);
      window.history.replaceState(null, "", "?scan=" + j.id);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  }
  async function save() {
    if (!scan) return;
    setBusy(true);
    try {
      const p = await api("passports", { scanId: scan.id });
      setPassport(p.report.id);
      chooseTab("passport");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function explainNow() {
    if (!scan) return;
    setBusy(true);
    setStage("Requesting 0G inference");
    try {
      setInference(await api("ai/explain", { scanId: scan.id }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="container">
      {view === "history" ? (
        <>
          <div className="page-title">
            <GitCompareArrows />
            <div>
              <h1>Scan history</h1>
              <p>Every scan retains its observed block and evidence.</p>
            </div>
          </div>
          <History scans={scans} />
        </>
      ) : view === "registry" ? (
        <Registry />
      ) : (
        <>
          {!scan && (
            <section className="intro">
              <div>
                <h1>
                  Know what your <br />
                  hook does.
                </h1>
                <p>
                  Inspect permissions, follow the evidence, and compare what
                  changed.
                </p>
              </div>
              <div className="intro-record">
                <span>Three questions. One evidence trail.</span>
                <ol>
                  <li>
                    <span>01</span>What can this hook do?
                  </li>
                  <li>
                    <span>02</span>What do the observations support?
                  </li>
                  <li>
                    <span>03</span>Does this version still match?
                  </li>
                </ol>
              </div>
            </section>
          )}
          <form className="scanner" onSubmit={start}>
            <div className="scanner-fields">
              <label className="address-field">
                Hook address
                <div className="input-icon">
                  <Search size={18} />
                  <input
                    aria-label="Hook address"
                    placeholder="0x…"
                    value={address}
                    onChange={(e) => setAddress(e.target.value.trim())}
                    required
                    pattern="0x[a-fA-F0-9]{40}"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </label>
              <label>
                Network
                <select
                  value={chainId}
                  onChange={(e) => setChainId(Number(e.target.value))}
                >
                  {chains.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={busy || fixtureBusy}
                aria-busy={busy || fixtureBusy}
                type="submit"
              >
                {busy ? "Scanning…" : scan ? "Rescan hook" : "Scan a hook"}
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="scan-options">
              <label className="check">
                <input
                  type="checkbox"
                  checked={
                    withAI &&
                    !!health?.inferenceConfigured &&
                    !!health?.freeCreditsConfirmed
                  }
                  disabled={
                    !health?.inferenceConfigured ||
                    !health?.freeCreditsConfirmed
                  }
                  aria-describedby="inference-status"
                  onChange={(e) => setWithAI(e.target.checked)}
                />
                Include 0G evidence explanation
              </label>
              <span id="inference-status">
                {health?.inferenceConfigured
                  ? health.freeCreditsConfirmed
                    ? "Existing free credits confirmed"
                    : "Free-credit confirmation required"
                  : "0G not configured; deterministic analysis remains available"}
              </span>
            </div>
          </form>
          {busy && (
            <div className="progress" role="status">
              <span className="loading-bar" />
              <span>{stage}</span>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {scan ? (
            <>
              <section className="scan-heading">
                <div>
                  <div className="inline">
                    <span className="badge cool">
                      {chains.find((c) => c.id === scan.chainId)?.name}
                    </span>
                    <span className="muted">
                      Block <code>{scan.blockNumber}</code>
                    </span>
                  </div>
                  <h2 className="contract-address" title={scan.address}>
                    {short(scan.address)}
                    <CopyValue value={scan.address} />
                  </h2>
                  <p>
                    Observed {new Date(scan.blockTimestamp).toUTCString()}{" "}
                    <span className="badge">
                      {scan.compatibility === "POOL_OBSERVED"
                        ? "Pool association observed"
                        : scan.compatibility === "INVALID"
                          ? "Invalid flag dependencies"
                          : "Hook compatibility unknown"}
                    </span>
                  </p>
                </div>
                <button className="quiet" onClick={save} disabled={busy}>
                  <FileCheck2 size={16} />
                  Save passport
                </button>
              </section>
              <nav className="tabs" aria-label="Scan sections">
                {[
                  ["overview", "Overview"],
                  ["evidence", "Evidence graph"],
                  ["diff", "Behavior diff"],
                  ["simulation", "Simulation"],
                  ["explanation", "0G explanation"],
                  ["passport", "Hook passport"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-current={tab === id ? "page" : undefined}
                    onClick={() => chooseTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {tab === "overview" && (
                <>
                  <div className="overview-grid">
                    <section>
                      <h2>Observed contract</h2>
                      <div className="facts">
                        <Value
                          label="Runtime bytecode hash"
                          value={scan.runtimeHash}
                        />
                        <Value
                          label="Code size"
                          value={scan.codeSize + " bytes"}
                        />
                        <Value label="Proxy pattern" value={scan.proxy.kind} />
                        <Value
                          label="Implementation"
                          value={scan.proxy.implementation ?? "UNKNOWN"}
                        />
                        <Value
                          label="Implementation hash"
                          value={scan.proxy.implementationHash ?? "UNKNOWN"}
                        />
                        <Value
                          label="Source verification"
                          value={scan.source.status}
                        />
                        <Value
                          label="State fingerprint"
                          value={scan.stateFingerprint}
                        />
                        <Value
                          label="Observation fingerprint"
                          value={scan.observationFingerprint}
                        />
                        <Value
                          label="Analysis version"
                          value={scan.analysisVersion}
                        />
                      </div>
                    </section>
                    <section>
                      <h2>Hook identity</h2>
                      <div className="facts">
                        <Value
                          label="Hook status"
                          value={scan.hookStatus.replaceAll("_", " ")}
                        />
                        <Value
                          label="Deployment"
                          value={
                            scan.deployment?.status === "OBSERVED"
                              ? `tx ${scan.deployment.txHash} at block ${scan.deployment.blockNumber}`
                              : "UNKNOWN — creation not inside the probed window"
                          }
                        />
                        <Value
                          label="Deployer"
                          value={
                            scan.deployment?.deployer ??
                            "UNKNOWN — not observed"
                          }
                        />
                        <Value
                          label="Deployed at (UTC)"
                          value={
                            scan.deployment?.timestamp
                              ? new Date(
                                  scan.deployment.timestamp,
                                ).toUTCString()
                              : "UNKNOWN"
                          }
                        />
                        <Value
                          label="Owner getter"
                          value={scan.owner ?? "No owner() value observed"}
                        />
                        <Value
                          label="Proxy admin"
                          value={scan.proxy.admin ?? "None observed"}
                        />
                        <Value
                          label="PoolManager"
                          value={scan.poolContext.manager ?? "Not configured"}
                        />
                        <Value
                          label="Pools observed"
                          value={String(scan.poolContext.pools.length)}
                        />
                      </div>
                      {scan.participants.length > 0 && (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Participant</th>
                                <th>Role</th>
                                <th>How it was derived</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scan.participants.map((p) => (
                                <tr key={p.role + p.address}>
                                  <td>
                                    <code title={p.address}>
                                      {short(p.address)}
                                    </code>
                                  </td>
                                  <td>
                                    <span className="badge">{p.role}</span>
                                  </td>
                                  <td>{p.evidence}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                    <section>
                      <h2>Investigation indicators</h2>
                      <div className="score">
                        <span className="reading">
                          {scan.attentionScore}
                          <small>/100</small>
                        </span>
                        <span>
                          Rule-weighted attention index
                          <br />
                          <strong>
                            A higher index calls for closer investigation.
                          </strong>
                        </span>
                      </div>
                      <p className="muted">
                        Capabilities and indicators do not establish a
                        vulnerability.
                      </p>
                      <FindingList
                        scan={scan}
                        onSelect={(id) => {
                          setSelectedFinding(id);
                          chooseTab("evidence");
                        }}
                      />
                    </section>
                  </div>
                  <ActivityPanel scan={scan} />
                  <section>
                    <div className="section-head">
                      <h2>Hook permissions</h2>
                      <span className="measured">
                        Bitmap {scan.permissionBitmap} / 0x
                        {scan.permissionBitmap.toString(16)}
                      </span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Callback / capability</th>
                            <th>Address flag</th>
                            <th>Meaning</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scan.permissions.map((p) => (
                            <tr key={p.name}>
                              <td>
                                <code>{p.name}</code>
                              </td>
                              <td>
                                <span
                                  className={
                                    "badge " + (p.enabled ? "cool" : "")
                                  }
                                >
                                  {p.enabled ? "Enabled" : "Disabled"}
                                </span>
                              </td>
                              <td>{p.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <Limitations items={scan.limitations} />
                </>
              )}
              {tab === "evidence" && (
                <EvidenceGraph scan={scan} initialFinding={selectedFinding} />
              )}
              {tab === "diff" && <DiffView scan={scan} />}
              {tab === "simulation" && <Simulations />}
              {tab === "explanation" && (
                <section>
                  <div className="section-head">
                    <h2>Evidence-grounded explanation</h2>
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={explainNow}
                    >
                      <RotateCw size={16} />
                      Request explanation
                    </button>
                  </div>
                  {!inference ? (
                    <Empty
                      title="No inference recorded"
                      text="0G explains deterministic findings using their exact evidence IDs. Configure existing free credits to enable it."
                    />
                  ) : (
                    <>
                      <div
                        className={
                          "notice " +
                          (inference.status === "failed" ? "error" : "")
                        }
                      >
                        <strong>{inference.status}</strong>
                        <p>
                          {inference.error ||
                            "Provider response saved. AI explanations are not independent proof."}
                        </p>
                      </div>
                      <div className="facts">
                        <Value
                          label="Actual 0G request ID"
                          value={
                            inference.requestId ?? "No request ID returned"
                          }
                        />
                        <Value
                          label="Model"
                          value={inference.model || "Not configured"}
                        />
                        <Value
                          label="Trust mode requested"
                          value={inference.trustMode}
                        />
                        <Value
                          label="Router-reported TEE verification"
                          value={String(
                            inference.routerTeeVerified ?? "UNKNOWN",
                          )}
                        />
                        <Value
                          label="Independent verification"
                          value={inference.independentVerification}
                        />
                        <Value label="Input hash" value={inference.inputHash} />
                      </div>
                      {inference.output !== null && (
                        <pre className="code-block">
                          {JSON.stringify(inference.output, null, 2)}
                        </pre>
                      )}
                    </>
                  )}
                </section>
              )}
              {tab === "passport" &&
                (passport ? (
                  <PassportView id={passport} />
                ) : (
                  <Empty
                    title="Preserve this analysis"
                    text="Save an immutable report with its canonical hash. Registry publication and current-contract matching are separate verification steps."
                    action={
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={save}
                      >
                        Save passport
                      </button>
                    }
                  />
                ))}
            </>
          ) : (
            <section className="onboarding">
              <p className="protocol-description">
                Uniswap v4 hooks are contracts that customize pool operations.
                Their permissions describe what they can do; code observations
                and controlled execution help explain what they actually do.
              </p>
              <h2>From an address to inspectable evidence</h2>
              <div className="steps">
                <article>
                  <h3>Inspect capabilities</h3>
                  <p>
                    Decode all fourteen flags and record code at an exact block.
                  </p>
                </article>
                <article>
                  <h3>Follow the evidence</h3>
                  <p>
                    Open each finding and inspect the observations behind it.
                  </p>
                </article>
                <article>
                  <h3>Compare observations</h3>
                  <p>
                    Track implementation changes and evidence that needs
                    reassessment.
                  </p>
                </article>
                <article>
                  <h3>Verify the report</h3>
                  <p>
                    Check report integrity and whether the current version
                    matches.
                  </p>
                </article>
              </div>
              <div className="local-fixture">
                <button
                  className="quiet"
                  onClick={() => {
                    setAddress("0x322dcEc4958C14e021A9F1cD49DF11b9457968cC");
                    setChainId(1);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Load live Ethereum hook
                </button>
                <span className="muted">
                  Selects a deployed hook address. Scan it to fetch a fresh
                  block and evidence.
                </span>
              </div>
              <div className="local-fixture">
                <button
                  className="quiet"
                  disabled={fixtureBusy}
                  onClick={async () => {
                    setFixtureBusy(true);
                    try {
                      const f = await api("fixture");
                      setAddress(f.hook);
                      setChainId(31337);
                    } catch {
                      setError(
                        "No local fixture deployed yet. Run npm run simulation to create a reproducible local scenario.",
                      );
                    } finally {
                      setFixtureBusy(false);
                    }
                  }}
                >
                  Load local test hook
                </button>
                <span className="muted">
                  Uses an actual deployment from the local simulation runner.
                </span>
              </div>
              <h2 className="workflow-heading">Analysis and publication</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Technology</th>
                      <th>Role in this workflow</th>
                      <th>Execution evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Uniswap v4</td>
                      <td>
                        Hook permissions, PoolManager context and controlled
                        swap accounting.
                      </td>
                      <td>Live reads and local fixture executions recorded.</td>
                    </tr>
                    <tr>
                      <td>0G Private Computer</td>
                      <td>
                        Explain deterministic findings with an identifiable
                        inference request.
                      </td>
                      <td>
                        {health?.inferenceConfigured
                          ? "Configured; inspect each scan’s actual request evidence."
                          : "Not configured. Explanation and inference provenance are unavailable."}
                      </td>
                    </tr>
                    <tr>
                      <td>Chainlink CRE</td>
                      <td>
                        Validate the analysis API against blockchain state and
                        orchestrate registry publication.
                      </td>
                      <td>
                        Workflow compiled. Authenticated runtime simulation
                        pending.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      <details className="operator">
        <summary>Operator access</summary>
        <p>
          For a protected deployment, enter its operator token. It stays in this
          browser session.
        </p>
        <input
          aria-label="Operator token"
          type="password"
          autoComplete="off"
          onChange={(e) =>
            sessionStorage.setItem("hscan-operator", e.target.value)
          }
        />
      </details>
    </main>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Limitations({ items }: { items: string[] }) {
  return (
    <details className="limitations">
      <summary>Detection limits and scope</summary>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </details>
  );
}
function FindingList({
  scan,
  onSelect,
}: {
  scan: Snapshot;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="finding-list">
      {scan.findings.length ? (
        scan.findings.map((f) => (
          <button key={f.id} onClick={() => onSelect(f.id)}>
            <span className={"badge " + f.severity}>{f.severity}</span>
            <span>
              {f.title}
              <small>
                {f.category} / {f.status.toLowerCase()}
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
        ))
      ) : (
        <p>
          No rules fired within the inspected scope. This does not establish
          safety.
        </p>
      )}
    </div>
  );
}
function EvidenceGraph({
  scan,
  initialFinding,
}: {
  scan: Snapshot;
  initialFinding: string;
}) {
  const [findingId, setFindingId] = useState(
      initialFinding || scan.findings[0]?.id || "",
    ),
    [nodeId, setNodeId] = useState("");
  const finding = scan.findings.find((f) => f.id === findingId);
  const evidence = scan.evidence.nodes.filter((n) =>
    finding?.evidenceIds.includes(n.id),
  );
  const node = scan.evidence.nodes.find((n) => n.id === nodeId) || evidence[0];
  return (
    <section>
      <h2>Follow a finding to its evidence</h2>
      <p className="muted">
        Select a finding, then inspect its supporting observations. Unknown
        evidence remains unknown.
      </p>
      <div className="graph" aria-label="Interactive evidence graph">
        <div className="graph-column">
          <h3>Findings</h3>
          {scan.findings.map((f) => (
            <button
              key={f.id}
              className={"node " + (f.id === findingId ? "selected" : "")}
              onClick={() => {
                setFindingId(f.id);
                setNodeId("");
              }}
            >
              <span className={"badge " + f.severity}>{f.severity}</span>
              <strong>{f.title}</strong>
              <small>{f.ruleId}</small>
            </button>
          ))}
        </div>
        <div className="graph-column">
          <h3>Supporting evidence</h3>
          {evidence.map((n) => (
            <button
              key={n.id}
              className={"node " + (node?.id === n.id ? "selected" : "")}
              onClick={() => setNodeId(n.id)}
            >
              <span className="relation">Supports finding</span>
              <strong>{n.label}</strong>
              <small>
                {n.type} / {n.status.toLowerCase()}
              </small>
            </button>
          ))}
          {!evidence.length && <p>No finding selected.</p>}
        </div>
        <div className="graph-detail">
          <h3>Observation detail</h3>
          {node && (
            <>
              <span className="badge cool">{node.status.toLowerCase()}</span>
              <h4>{node.label}</h4>
              <code>{node.id}</code>
              <dl>
                <dt>Detection method</dt>
                <dd>{node.method}</dd>
                <dt>Chain / block</dt>
                <dd>
                  {node.chainId} / {node.blockNumber}
                </dd>
                <dt>Timestamp</dt>
                <dd>{node.timestamp}</dd>
              </dl>
              <pre>{JSON.stringify(node.data, null, 2)}</pre>
              <ul>
                {node.limitations.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {finding && (
            <>
              <h4>Why this finding exists</h4>
              <p>{finding.explanation}</p>
              <p>
                <strong>Confidence:</strong> {finding.confidence}
              </p>
              <p>
                <strong>Investigate:</strong> {finding.investigation}
              </p>
            </>
          )}
        </div>
      </div>
      <details>
        <summary>Browse all evidence nodes and relationships</summary>
        <div className="node-browser">
          {scan.evidence.nodes.map((n) => (
            <button
              key={n.id}
              className="quiet"
              onClick={() => setNodeId(n.id)}
            >
              {n.label}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>Relationship</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {scan.evidence.edges.map((e, i) => (
                <tr key={i}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setNodeId(e.from)}
                    >
                      {e.from}
                    </button>
                  </td>
                  <td>{e.type.toLowerCase().replaceAll("_", " ")}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setNodeId(e.to)}
                    >
                      {e.to}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
function ActivityPanel({ scan }: { scan: Snapshot }) {
  const [state, setState] = useState<{
      activities: Record<string, unknown>[];
      total: number;
      counts: Record<string, number>;
      lastIndexedBlock: string | null;
    } | null>(null),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const limit = 20;
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(
      `hooks/${scan.chainId}/${scan.address}/activity?limit=${limit}&offset=${offset}`,
    )
      .then((d) => {
        if (active) {
          setState(d);
          setError("");
        }
      })
      .catch((e) => active && setError((e as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [scan.chainId, scan.address, offset]);
  const counts = state?.counts ?? scan.activity?.counts ?? {};
  return (
    <section>
      <div className="section-head">
        <h2>Observed activity</h2>
        <span className="measured">
          {scan.activity
            ? `Window ${scan.activity.fromBlock}–${scan.activity.toBlock}`
            : "No indexing window recorded"}
        </span>
      </div>
      <p className="muted">
        Rows are PoolManager events for pools initialized with this hook. Hook
        callbacks do not emit their own logs, so this is not a complete record
        of callback executions.
      </p>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
      {scan.activity?.reason && (
        <div className="notice">{scan.activity.reason}</div>
      )}
      <div className="inline">
        {Object.keys(counts).length ? (
          Object.entries(counts).map(([kind, n]) => (
            <span key={kind} className="badge">
              {kind.replaceAll("-", " ")} · {n}
            </span>
          ))
        ) : (
          <span className="muted">No indexed events in this window.</span>
        )}
      </div>
      {loading && !state ? (
        <div className="progress" role="status">
          <span className="loading-bar" />
          <span>Reading indexed activity…</span>
        </div>
      ) : state && state.activities.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Block</th>
                <th>Kind</th>
                <th>Event</th>
                <th>Sender</th>
                <th>Pool</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {state.activities.map((a) => (
                <tr key={String(a.id)}>
                  <td>
                    <code>{String(a.blockNumber)}</code>
                  </td>
                  <td>{String(a.kind).replaceAll("-", " ")}</td>
                  <td>{String(a.eventName ?? "—")}</td>
                  <td>
                    {a.sender ? (
                      <code title={String(a.sender)}>
                        {short(String(a.sender))}
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {a.poolId ? (
                      <code title={String(a.poolId)}>
                        {short(String(a.poolId))}
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {a.txHash ? (
                      <code title={String(a.txHash)}>
                        {short(String(a.txHash))}
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No activity in the indexed window"
          text="A quiet window is not proof of inactivity: older or out-of-range events exist. Rescan with a wider start block to extend the record."
        />
      )}
      {state && state.total > limit && (
        <div className="pager">
          <button
            className="quiet"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </button>
          <span className="muted">
            {offset + 1}–{Math.min(offset + limit, state.total)} of{" "}
            {state.total}
          </span>
          <button
            className="quiet"
            disabled={offset + limit >= state.total || loading}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
function History({ scans }: { scans: Snapshot[] }) {
  return scans.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Hook</th>
            <th>Network</th>
            <th>Block</th>
            <th>Scan time (UTC)</th>
            <th>Observations</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((s) => (
            <tr key={s.id}>
              <td>
                <a className="measured" href={"/?scan=" + s.id}>
                  {short(s.address)}
                </a>
              </td>
              <td>{chains.find((c) => c.id === s.chainId)?.name}</td>
              <td>
                <code>{s.blockNumber}</code>
              </td>
              <td>{new Date(s.scannedAt).toUTCString()}</td>
              <td>{s.findings.length} findings</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="No scans yet"
      text="Scan a deployed contract to start its block-specific history."
      action={
        <a className="primary" href="/">
          Open scanner
        </a>
      }
    />
  );
}
function DiffView({ scan }: { scan: Snapshot }) {
  const [history, setHistory] = useState<Snapshot[]>([]),
    [previous, setPrevious] = useState(""),
    [diff, setDiff] = useState<Diff | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api(`hooks/${scan.chainId}/${scan.address}/history`).then((h) => {
      setHistory(h);
      setPrevious(
        h.find(
          (s: Snapshot) => s.id !== scan.id && s.scannedAt < scan.scannedAt,
        )?.id || "",
      );
    });
  }, [scan]);
  async function compare() {
    try {
      setError("");
      setDiff(await api("diffs", { previousId: previous, currentId: scan.id }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section>
      <div className="section-head">
        <h2>Behavior diff</h2>
        <span className="muted">Same hook. Two observations.</span>
      </div>
      <div className="compare-controls">
        <label>
          Previous observation
          <select
            value={previous}
            onChange={(e) => setPrevious(e.target.value)}
          >
            <option value="">Select a scan</option>
            {history
              .filter((s) => s.id !== scan.id && s.scannedAt <= scan.scannedAt)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.blockNumber} / {new Date(s.scannedAt).toUTCString()}
                </option>
              ))}
          </select>
        </label>
        <button className="quiet" disabled={!previous} onClick={compare}>
          Compare versions
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {diff ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Observation</th>
                  <th>Previous</th>
                  <th>Current</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {diff.changes.map((c) => (
                  <tr
                    key={c.field}
                    className={c.status === "changed" ? "changed" : ""}
                  >
                    <td>{c.field}</td>
                    <td>
                      <code>
                        {typeof c.before === "object"
                          ? JSON.stringify(c.before)
                          : String(c.before ?? "UNKNOWN")}
                      </code>
                    </td>
                    <td>
                      <code>
                        {typeof c.after === "object"
                          ? JSON.stringify(c.after)
                          : String(c.after ?? "UNKNOWN")}
                      </code>
                    </td>
                    <td>
                      <span className="badge">{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Finding changes</h3>
          {diff.findings.map((f) => (
            <p key={f.id}>
              <span className="badge">{f.status}</span>{" "}
              {f.after?.title || f.before?.title}
            </p>
          ))}
          <Limitations items={diff.limitations} />
        </>
      ) : (
        <Empty
          title={
            previous ? "Select a comparison" : "A second observation is needed"
          }
          text="Rescan this address, then compare it with an earlier scan. A different block alone is not a code change."
        />
      )}
      <h3>Scan history</h3>
      <History scans={history} />
    </section>
  );
}
function Simulations() {
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    api("simulations").then(setResults);
  }, []);
  return (
    <section>
      <h2>Controlled behavioral simulation</h2>
      <p className="muted">
        Local fixtures use actual Uniswap v4 contracts. They do not execute the
        scanned production hook.
      </p>
      {results.length ? (
        results.map((r, i) => (
          <details key={i} open>
            <summary>
              {String(r.scenarioId || "Recorded execution")} / local fixture
            </summary>
            <pre className="code-block">{JSON.stringify(r, null, 2)}</pre>
          </details>
        ))
      ) : (
        <Empty
          title="No simulation results recorded"
          text="Run npm run simulation on the server to deploy the local fixture and preserve actual baseline versus hook execution evidence."
        />
      )}
    </section>
  );
}
function Registry() {
  const [data, setData] = useState<{
    configured: boolean;
    address: string | null;
    passports: { id: string; report_hash: string; created_at: string }[];
  } | null>(null);
  useEffect(() => {
    api("registry").then(setData);
  }, []);
  return (
    <section>
      <div className="page-title">
        <FileCheck2 />
        <div>
          <h1>Report registry</h1>
          <p>
            Publication records bind a report hash to an authorized publisher.
          </p>
        </div>
      </div>
      {data ? (
        <>
          <div className="notice">
            {data.configured
              ? `Configured registry: ${data.address}`
              : "No on-chain registry configured. Saved passports below have not been claimed as published."}
          </div>
          {data.passports.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Passport</th>
                    <th>Report hash</th>
                    <th>Created (UTC)</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {data.passports.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <a href={"/passport/" + p.id}>{short(p.id)}</a>
                      </td>
                      <td>
                        <code>{short(p.report_hash)}</code>
                      </td>
                      <td>{new Date(p.created_at).toUTCString()}</td>
                      <td>
                        <a href={"/verify/" + p.id}>Check registry</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No passports saved"
              text="Complete a scan and save its passport to create a verifiable report."
            />
          )}
        </>
      ) : (
        <p role="status">Loading registry…</p>
      )}
    </section>
  );
}
