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
import { compareSnapshots } from "@/core/diff";
import PassportView from "./passport";
import DiscoveryPanel from "./discovery-panel";
import DeployPanel from "./deploy-panel";
import type { WalletInfo } from "./wallet";
const chains = [
  { id: 1, name: "Ethereum" },
  { id: 11155111, name: "Sepolia" },
  { id: 8453, name: "Base" },
  { id: 31337, name: "Local fixture" },
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
    [chainId, setChainId] = useState(11155111),
    [poolFromBlock, setPoolFromBlock] = useState(""),
    [ensName, setEnsName] = useState(""),
    [scan, setScan] = useState<Snapshot | null>(null),
    [jobId, setJobId] = useState<string | null>(null),
    [stage, setStage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selectedFinding, setSelectedFinding] = useState(""),
    [selectedPermission, setSelectedPermission] = useState(""),
    [tab, setTab] = useState("overview"),
    [view, setView] = useState("dashboard"),
    [scans, setScans] = useState<Snapshot[]>([]),
    [scansLoading, setScansLoading] = useState(true),
    [scansError, setScansError] = useState(""),
    [passportCount, setPassportCount] = useState<number | null>(null),
    [inference, setInference] = useState<AIResult | null>(null),
    [passport, setPassport] = useState<string | null>(null),
    [fixtureBusy, setFixtureBusy] = useState(false),
    [withAI, setWithAI] = useState(true),
    [historyError, setHistoryError] = useState(""),
    [healthError, setHealthError] = useState(""),
    [health, setHealth] = useState<{
      status?: string;
      inferenceConfigured: boolean;
      freeCreditsConfirmed: boolean;
      storage?: { ok: boolean; durable: boolean; note: string };
    } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setView(q.get("view") || (q.has("scan") ? "scanner" : "dashboard"));
    setTab(q.get("tab") || "overview");
    setSelectedFinding(q.get("finding") || "");
    const id = q.get("scan");
    if (id) setJobId(id);
    // Scan history answers `{ scans, unreadable, storage, notice }`. Reading the
    // envelope here (rather than assuming an array) keeps an empty history and
    // a degraded one from being reported the same way.
    api("scans")
      .then((value) => setScans(Array.isArray(value) ? value : value.scans || []))
      .catch((e) => {
        setHistoryError((e as Error).message);
        setScansError((e as Error).message);
      })
      .finally(() => setScansLoading(false));
    api("health")
      .then(setHealth)
      .catch((e) => setHealthError((e as Error).message));
    api("passports")
      .then((items: unknown[]) => setPassportCount(items.length))
      .catch(() => {});
  }, []);
  // The Operate view needs the same wallet state the header shows. The header
  // publishes it through a window event because it is rendered by the root
  // layout, outside this component tree.
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  useEffect(() => {
    const read = () =>
      setWallet(
        (window as unknown as { klyroWallet?: WalletInfo | null }).klyroWallet ??
          null,
      );
    read();
    window.addEventListener("klyro:wallet", read);
    return () => window.removeEventListener("klyro:wallet", read);
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
          api("scans")
            .then((value) =>
              setScans(Array.isArray(value) ? value : value.scans || []),
            )
            .catch(() => {});
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
      // `explain` is only ever true when an AI provider is configured and
      // funded. The scan itself never waits on an explainer.
      const j = await api("scans", {
        address,
        chainId,
        ...(poolFromBlock ? { poolFromBlock } : {}),
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
    setStage("Requesting the optional AI explanation");
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
      {view === "dashboard" ? (
        <Dashboard
          scans={scans}
          loading={scansLoading}
          error={scansError}
          passportCount={passportCount}
        />
      ) : view === "history" ? (
        <>
          <div className="page-title">
            <GitCompareArrows />
            <div>
              <h1>Scan history</h1>
              <p>Every scan retains its observed block and evidence.</p>
            </div>
          </div>
          <History scans={scans} loading={scansLoading} error={scansError} />
        </>
      ) : view === "comparisons" ? (
        <ComparisonWorkspace
          scans={scans}
          loading={scansLoading}
          error={scansError}
        />
      ) : view === "evidence" ? (
        <EvidenceWorkspace
          scans={scans}
          loading={scansLoading}
          error={scansError}
        />
      ) : view === "passports" ? (
        <PassportIndex />
      ) : view === "settings" ? (
        <WorkspaceSettings health={health} />
      ) : view === "registry" ? (
        <Registry />
      ) : view === "deploy" ? (
        <>
          <div className="page-title">
            <Network />
            <div>
              <h1>Operate</h1>
              <p>
                Wallet-signed deployment and publication. Connecting a wallet
                here grants nothing until you approve a specific transaction.
              </p>
            </div>
          </div>
          {/* The header already carries the wallet control; repeating it here
              duplicated the status and left an empty band above the panels. */}
          <DeployPanel wallet={wallet} />
        </>
      ) : (
        <>
          {!scan && (
            <section className="intro scanner-intro">
              <div>
                <span className="section-index">New investigation / 01</span>
                <h1>
                  Know what your <br />
                  hook does.
                </h1>
                <p>
                  Enter a deployed contract address to capture a block-specific
                  investigation with inspectable evidence.
                </p>
              </div>
              <div className="intro-record">
                <span>Investigation sequence</span>
                <ol>
                  <li>
                    <span>01</span>Capture contract state
                  </li>
                  <li>
                    <span>02</span>Trace findings to evidence
                  </li>
                  <li>
                    <span>03</span>Compare later observations
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
                    onChange={(e) => { setAddress(e.target.value.trim()); setPoolFromBlock(""); setEnsName(""); }}
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
                  onChange={(e) => { setChainId(Number(e.target.value)); setPoolFromBlock(""); setEnsName(""); }}
                >
                  {chains.filter((c) => c.id !== 31337 || chainId === 31337).map((c) => (
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
                Include AI explanation (optional)
              </label>
              <span id="inference-status">
                {healthError
                  ? "Health check failed; scanning still works. " + healthError
                  : health?.inferenceConfigured
                    ? health.freeCreditsConfirmed
                      ? "AI explainer configured with existing free credits"
                      : "AI explainer configured; free-credit confirmation required"
                    : "No AI explainer configured. The deterministic analysis is complete without it."}
              </span>
            </div>
          </form>
          {!scan && <DiscoveryPanel request={api} onSelect={(hook, firstBlock, name) => {
            setAddress(hook);
            setChainId(11155111);
            setPoolFromBlock(firstBlock);
            setEnsName(name ?? "");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }} />}
          {busy && (
            <div className="progress" role="status">
              <span className="loading-graph" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
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
                  {ensName && <p className="ens-identity"><strong>{ensName}</strong> resolves to this address on Ethereum mainnet. The Sepolia contract is identified by its address and scanned bytecode.</p>}
                  <p>
                    Observed {new Date(scan.blockTimestamp).toUTCString()}{" "}
                    <span className="badge">
                      Source {scan.source.status.toLowerCase()}
                    </span>{" "}
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
                  ["explanation", "AI explanation"],
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
                        <Value label="Contract address" value={scan.address} />
                        <Value
                          label="Network"
                          value={
                            chains.find((c) => c.id === scan.chainId)?.name ||
                            String(scan.chainId)
                          }
                        />
                        <Value
                          label="Scan time"
                          value={new Date(scan.scannedAt).toUTCString()}
                        />
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
                            <tr
                              key={p.name}
                              className={
                                selectedPermission === p.name
                                  ? "permission-selected"
                                  : ""
                              }
                            >
                              <td>
                                <button
                                  className="permission-button"
                                  aria-expanded={selectedPermission === p.name}
                                  onClick={() =>
                                    setSelectedPermission(
                                      selectedPermission === p.name
                                        ? ""
                                        : p.name,
                                    )
                                  }
                                >
                                  <code>{p.name}</code>
                                </button>
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
                    {selectedPermission &&
                      (() => {
                        const permission = scan.permissions.find(
                          (p) => p.name === selectedPermission,
                        );
                        const evidence = scan.evidence.nodes.find(
                          (n) => n.id === "permission:" + selectedPermission,
                        );
                        if (!permission) return null;
                        return (
                          <div className="permission-detail">
                            <div>
                              <span className="section-index">
                                Permission / bit {permission.bit}
                              </span>
                              <h3>{permission.name}</h3>
                              <p>{permission.description}</p>
                            </div>
                            <div>
                              <strong>
                                {permission.enabled ? "Enabled" : "Disabled"}
                              </strong>
                              <span>
                                Callback stage:{" "}
                                {permission.name.startsWith("before")
                                  ? "Before"
                                  : "After"}
                                {permission.name.includes("ReturnDelta")
                                  ? " / return delta"
                                  : ""}
                              </span>
                              <span>
                                Evidence:{" "}
                                {evidence?.source || "Address-derived bit"}
                              </span>
                              <button
                                className="editorial-link"
                                onClick={() => {
                                  setSelectedFinding("");
                                  chooseTab("evidence");
                                }}
                              >
                                Inspect evidence graph <ArrowRight size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                  </section>
                  <section className="contract-research">
                    <div className="section-head">
                      <h2>Contract &amp; dependencies</h2>
                      <span className="muted">Block-pinned observations</span>
                    </div>
                    <div className="research-grid">
                      <article>
                        <span className="section-index">Implementation</span>
                        <div className="facts">
                          <Value label="Proxy type" value={scan.proxy.kind} />
                          <Value
                            label="Implementation"
                            value={
                              scan.proxy.implementation || "Not identified"
                            }
                          />
                          <Value
                            label="Admin"
                            value={scan.proxy.admin || "Not identified"}
                          />
                          <Value
                            label="Observed pools"
                            value={String(scan.poolContext.pools.length)}
                          />
                        </div>
                      </article>
                      <article>
                        <span className="section-index">
                          External address candidates
                        </span>
                        {scan.dependencies.length ? (
                          <ul className="dependency-list">
                            {scan.dependencies.map((candidate) => (
                              <li key={candidate}>
                                <code>{candidate}</code>
                                <span>
                                  Static bytecode candidate; execution
                                  unconfirmed.
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">
                            No address candidates identified by the bounded
                            opcode inspection.
                          </p>
                        )}
                      </article>
                    </div>
                    <div className="source-panel">
                      <span className="section-index">
                        Source investigation
                      </span>
                      <p>
                        Runtime match: <strong>{scan.source.status}</strong>.{" "}
                        {scan.source.files.length} source file
                        {scan.source.files.length === 1 ? "" : "s"} available
                        from Sourcify.
                      </p>
                      {scan.source.files.map((file) => (
                        <details key={file.name}>
                          <summary>{file.name}</summary>
                          <pre className="code-block">{file.content}</pre>
                        </details>
                      ))}
                    </div>
                  </section>
                  <Limitations items={scan.limitations} />
                </>
              )}
              {tab === "evidence" && (
                <EvidenceGraph
                  scan={scan}
                  initialFinding={selectedFinding}
                  initialNode={
                    typeof window !== "undefined"
                      ? new URLSearchParams(location.search).get("node") || ""
                      : ""
                  }
                />
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
                      title="No explanation requested"
                      text="An optional AI explainer can restate the deterministic findings using their exact evidence IDs. It is never required: findings, evidence, hashes and the passport do not depend on it. When no provider is configured, nothing is generated."
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
                          label="AI provider request ID"
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
            <section className="onboarding scanner-utilities">
              <h2>Try a known address</h2>
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
              <details className="workflow-details">
              <summary>Analysis and publication status</summary>
              <div className="table-wrap workflow-table-wrap">
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
                      <td>AI explainer (optional)</td>
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
              </details>
            </section>
          )}
        </>
      )}
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
  initialNode = "",
}: {
  scan: Snapshot;
  initialFinding: string;
  initialNode?: string;
}) {
  const [findingId, setFindingId] = useState(
      initialFinding || scan.findings[0]?.id || "",
    ),
    [nodeId, setNodeId] = useState(initialNode);
  const finding = scan.findings.find((f) => f.id === findingId);
  const evidence = scan.evidence.nodes.filter((n) =>
    finding?.evidenceIds.includes(n.id),
  );
  const node = scan.evidence.nodes.find((n) => n.id === nodeId) || evidence[0];
  const diagramNodes = evidence.slice(0, 5);
  return (
    <section>
      <h2>Follow a finding to its evidence</h2>
      <p className="muted">
        Select a finding, then inspect its supporting observations. Unknown
        evidence remains unknown.
      </p>
      {finding && <div className="evidence-map-wrap">
        <svg className="evidence-map" viewBox="0 0 800 250" role="img" aria-label={`Finding ${finding.title} connected to ${diagramNodes.length} visible supporting observations`}>
          <path d="M 105 125 H 265" className="evidence-map-line" />
          {diagramNodes.map((item, index) => {
            const y = 35 + index * (180 / Math.max(1, diagramNodes.length - 1));
            return <g key={item.id} role="button" tabIndex={0} aria-label={`Inspect ${item.label}`} onClick={() => setNodeId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setNodeId(item.id); } }}>
              <path d={`M 265 125 L 570 ${y}`} className="evidence-map-line" />
              <circle cx="570" cy={y} r={node?.id === item.id ? 12 : 9} className={node?.id === item.id ? "evidence-map-point selected" : "evidence-map-point"} />
              <text x="595" y={y + 4}>{item.label.length > 22 ? item.label.slice(0, 21) + "…" : item.label}</text>
            </g>;
          })}
          <circle cx="105" cy="125" r="27" className="evidence-map-origin" />
          <text x="105" y="130" className="evidence-map-origin-label" textAnchor="middle">F</text>
          <text x="22" y="190" className="evidence-map-caption">{finding.ruleId}</text>
        </svg>
        <svg className="evidence-map-mobile" viewBox={`0 0 330 ${Math.max(160, 120 + diagramNodes.length * 50)}`} role="img" aria-label={`Finding ${finding.title} connected to ${diagramNodes.length} supporting observations`}>
          <circle cx="45" cy="36" r="22" className="evidence-map-origin" />
          <text x="45" y="41" className="evidence-map-origin-label" textAnchor="middle">F</text>
          <text x="82" y="41" className="evidence-map-title">{finding.title.length > 28 ? finding.title.slice(0, 27) + "…" : finding.title}</text>
          {diagramNodes.map((item, index) => {
            const y = 105 + index * 50;
            return <g key={item.id} role="button" tabIndex={0} aria-label={`Inspect ${item.label}`} onClick={() => setNodeId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setNodeId(item.id); } }}>
              <path d={`M 45 58 L 45 ${y} H 67`} className="evidence-map-line" />
              <circle cx="67" cy={y} r={node?.id === item.id ? 11 : 8} className={node?.id === item.id ? "evidence-map-point selected" : "evidence-map-point"} />
              <text x="89" y={y + 4}>{item.label.length > 31 ? item.label.slice(0, 30) + "…" : item.label}</text>
            </g>;
          })}
        </svg>
        {evidence.length > diagramNodes.length && <span className="muted">{evidence.length - diagramNodes.length} more observations in the list below</span>}
      </div>}
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
function groupedScans(scans: Snapshot[]) {
  const groups = new Map<string, Snapshot[]>();
  for (const scan of scans) {
    const key = `${scan.chainId}:${scan.address.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) || []), scan]);
  }
  return [...groups.values()].map((group) =>
    group.sort((a, b) =>
      BigInt(a.blockNumber) > BigInt(b.blockNumber)
        ? -1
        : BigInt(a.blockNumber) < BigInt(b.blockNumber)
          ? 1
          : b.scannedAt.localeCompare(a.scannedAt),
    ),
  );
}
function Dashboard({
  scans,
  loading,
  error,
  passportCount,
}: {
  scans: Snapshot[];
  loading: boolean;
  error: string;
  passportCount: number | null;
}) {
  const groups = groupedScans(scans);
  const latest = groups
    .map((group) => group[0])
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  const rescanned = groups.filter((group) => group.length > 1);
  const changed = rescanned.filter((group) => {
    try {
      return compareSnapshots(group[1], group[0]).changes.some(
        (change) => change.status === "changed",
      );
    } catch {
      return false;
    }
  });
  const networks = chains.filter((chain) =>
    scans.some((scan) => scan.chainId === chain.id),
  );
  return (
    <section className="dashboard">
      <div className="workspace-heading">
        <div>
          <span className="section-index">Investigation overview</span>
          <h1>Every hook has a history.</h1>
          <p>
            Start with an address, then follow its evidence across observations.
          </p>
        </div>
        <a className="primary" href="/app?view=scanner">
          New investigation <ArrowRight size={17} />

        </a>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="notice">
          Loading saved investigations…
        </p>
      ) : (
        <>
          <div className="dashboard-stats">
            <div>
              <span>Hooks in recent scans</span>
              <strong>{groups.length}</strong>
            </div>
            <div>
              <span>Rescanned in recent scans</span>
              <strong>{rescanned.length}</strong>
            </div>
            <div>
              <span>Detected recent changes</span>
              <strong>{changed.length}</strong>
            </div>
            <div>
              <span>Recent Hook Passports</span>
              <strong>{passportCount === null ? "—" : passportCount}</strong>
            </div>
          </div>
          <div className="dashboard-main">
            <div>
              <div className="section-head">
                <h2>Recent investigations</h2>
                <a className="editorial-link" href="/app?view=history">
                  View all history <ArrowRight size={16} />
                </a>
              </div>
              {latest.length ? (
                <div className="table-wrap">
                  <table className="recent-table">
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Network</th>
                        <th>Last scanned</th>
                        <th>Implementation</th>
                        <th>Findings</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.slice(0, 8).map((scan) => (
                        <tr key={scan.id}>
                          <td data-label="Contract">
                            <code title={scan.address}>
                              {short(scan.address)}
                            </code>
                          </td>
                          <td data-label="Network">
                            {chains.find((c) => c.id === scan.chainId)?.name}
                          </td>
                          <td data-label="Last scanned">
                            {new Date(scan.scannedAt).toLocaleDateString()}
                          </td>
                          <td data-label="Implementation">
                            <code>
                              {scan.proxy.implementation
                                ? short(scan.proxy.implementation)
                                : scan.proxy.kind === "direct"
                                  ? "Direct"
                                  : "Unknown"}
                            </code>
                          </td>
                          <td data-label="Findings">{scan.findings.length}</td>
                          <td data-label="Status">
                            <span className="badge">
                              {scan.source.status.toLowerCase()}
                            </span>
                          </td>
                          <td data-label="Action">
                            <a href={"/app?scan=" + scan.id}>Open</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No investigations yet"
                  text="Enter a deployed hook address to create the first block-specific investigation."
                  action={
                    <a className="primary" href="/app?view=scanner">
                      Investigate a hook
                    </a>
                  }
                />
              )}
            </div>
            <aside className="dashboard-aside">
              <span className="section-index">Observed networks</span>
              {networks.length ? (
                networks.map((network) => (
                  <div key={network.id}>
                    <strong>{network.name}</strong>
                    <span>
                      {
                        scans.filter((scan) => scan.chainId === network.id)
                          .length
                      }{" "}
                      saved scans
                    </span>
                  </div>
                ))
              ) : (
                <p>No network observations yet.</p>
              )}
              <span className="section-index">Rescanned hooks</span>
              {rescanned.length ? (
                rescanned.slice(0, 3).map((group) => (
                  <a
                    key={group[0].id}
                    href={"/app?scan=" + group[0].id + "&tab=diff"}
                  >
                    <code>{short(group[0].address)}</code>
                    <span>
                      {group.length} observations <ArrowRight size={14} />
                    </span>
                  </a>
                ))
              ) : (
                <p>Rescan a hook to compare versions.</p>
              )}
            </aside>
          </div>
        </>
      )}
      <p className="scope-note">
        Counts cover the 30 most recent scans and 50 most recent passports
        returned by this workspace. They do not measure contract safety or all
        on-chain activity.
      </p>
    </section>
  );
}
function History({
  scans,
  loading = false,
  error = "",
}: {
  scans: Snapshot[];
  loading?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("all");
  const groups = groupedScans(scans).filter(
    (group) =>
      group[0].address.toLowerCase().includes(query.toLowerCase()) &&
      (network === "all" || String(group[0].chainId) === network),
  );
  if (loading)
    return (
      <p role="status" className="notice">
        Loading scan history…
      </p>
    );
  if (error)
    return (
      <p role="alert" className="notice error">
        {error}
      </p>
    );
  return (
    <>
      <div className="history-filters">
        <label>
          Search contract
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="0x…"
          />
        </label>
        <label>
          Network
          <select
            value={network}
            onChange={(event) => setNetwork(event.target.value)}
          >
            <option value="all">All networks</option>
            {chains.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {groups.length ? (
        groups.map((group) => (
          <section
            className="history-group"
            key={`${group[0].chainId}:${group[0].address}`}
          >
            <div className="history-group-head">
              <div>
                <strong>{short(group[0].address)}</strong>
                <span>
                  {chains.find((chain) => chain.id === group[0].chainId)?.name}{" "}
                  / {group.length} observation{group.length === 1 ? "" : "s"}
                </span>
              </div>
              <a href={"/app?scan=" + group[0].id + "&tab=diff"}>
                Compare history <ArrowRight size={15} />
              </a>
            </div>
            <div className="table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Snapshot</th>
                    <th>Block</th>
                    <th>Scanned</th>
                    <th>Implementation</th>
                    <th>Findings</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((scan, index) => (
                    <tr key={scan.id}>
                      <td data-label="Snapshot">
                        {index === 0 ? "Latest" : "Earlier"}
                      </td>
                      <td data-label="Block">
                        <code>{scan.blockNumber}</code>
                      </td>
                      <td data-label="Scanned">
                        {new Date(scan.scannedAt).toLocaleString()}
                      </td>
                      <td data-label="Implementation">
                        <code>
                          {scan.proxy.implementation
                            ? short(scan.proxy.implementation)
                            : scan.proxy.kind}
                        </code>
                      </td>
                      <td data-label="Findings">{scan.findings.length}</td>
                      <td data-label="Action">
                        <a href={"/app?scan=" + scan.id}>Open investigation</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      ) : (
        <Empty
          title={scans.length ? "No matching contracts" : "No scans yet"}
          text={
            scans.length
              ? "Try another address or network filter."
              : "Scan a deployed contract to start its block-specific history."
          }
          action={
            !scans.length ? (
              <a className="primary" href="/app?view=scanner">
                Open scanner
              </a>
            ) : undefined
          }
        />
      )}
    </>
  );
}
function ComparisonWorkspace({
  scans,
  loading,
  error,
}: {
  scans: Snapshot[];
  loading: boolean;
  error: string;
}) {
  const [currentId, setCurrentId] = useState("");
  const candidates = groupedScans(scans)
    .filter((group) => group.length > 1)
    .flatMap((group) => group.slice(0, -1));
  const current =
    candidates.find((scan) => scan.id === currentId) || candidates[0];
  return (
    <section>
      <div className="workspace-heading">
        <div>
          <span className="section-index">
            Signature / historical comparison
          </span>
          <h1>What changed between observations?</h1>
          <p>
            Choose a saved hook snapshot, then compare it with an earlier
            observation of the same address.
          </p>
        </div>
      </div>
      {loading ? (
        <p role="status" className="notice">
          Loading comparisons…
        </p>
      ) : error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : current ? (
        <>
          <label className="workspace-select">
            Current snapshot
            <select
              value={current.id}
              onChange={(event) => setCurrentId(event.target.value)}
            >
              {candidates.map((scan) => (
                <option key={scan.id} value={scan.id}>
                  {short(scan.address)} /{" "}
                  {chains.find((chain) => chain.id === scan.chainId)?.name} /
                  block {scan.blockNumber}
                </option>
              ))}
            </select>
          </label>
          <DiffView key={current.id} scan={current} />
        </>
      ) : (
        <Empty
          title="Two scans of one hook are needed"
          text="Investigate a deployed address, then rescan it to make a real historical comparison."
          action={
            <a className="primary" href="/app?view=scanner">
              Start an investigation
            </a>
          }
        />
      )}
    </section>
  );
}
function EvidenceWorkspace({
  scans,
  loading,
  error,
}: {
  scans: Snapshot[];
  loading: boolean;
  error: string;
}) {
  const [id, setId] = useState("");
  const scan = scans.find((item) => item.id === id) || scans[0];
  return (
    <section>
      <div className="workspace-heading">
        <div>
          <span className="section-index">Evidence graph</span>
          <h1>Follow every relationship.</h1>
          <p>
            Choose an actual investigation to browse its findings, observations
            and graph edges.
          </p>
        </div>
      </div>
      {loading ? (
        <p role="status" className="notice">
          Loading evidence…
        </p>
      ) : error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : scan ? (
        <>
          <label className="workspace-select">
            Investigation
            <select
              value={scan.id}
              onChange={(event) => setId(event.target.value)}
            >
              {scans.map((item) => (
                <option key={item.id} value={item.id}>
                  {short(item.address)} / block {item.blockNumber}
                </option>
              ))}
            </select>
          </label>
          <EvidenceGraph key={scan.id} scan={scan} initialFinding="" />
        </>
      ) : (
        <Empty
          title="No evidence recorded yet"
          text="A completed live investigation creates the navigable evidence graph."
          action={
            <a className="primary" href="/app?view=scanner">
              Investigate a hook
            </a>
          }
        />
      )}
    </section>
  );
}
function PassportIndex() {
  const [items, setItems] = useState<
    { id: string; scan_id: string; report_hash: string; created_at: string }[]
  >([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api("passports")
      .then(setItems)
      .catch(() => setError("Saved passports could not be loaded."))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section>
      <div className="workspace-heading">
        <div>
          <span className="section-index">Preserved analysis</span>
          <h1>Hook Passports</h1>
          <p>
            Immutable reports with canonical hashes. Registry and current-state
            checks remain separate.
          </p>
        </div>
      </div>
      {loading ? (
        <p role="status" className="notice">
          Loading passports…
        </p>
      ) : error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Report hash</th>
                <th>Investigation</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td>
                    <code title={item.report_hash}>
                      {short(item.report_hash)}
                    </code>
                  </td>
                  <td>
                    <a href={"/app?scan=" + item.scan_id}>Open scan</a>
                  </td>
                  <td>
                    <a href={"/passport/" + item.id}>View passport</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No passports saved"
          text="Complete an investigation and save its report to create a reproducible Hook Passport."
          action={
            <a className="primary" href="/app?view=scanner">
              New investigation
            </a>
          }
        />
      )}
    </section>
  );
}
function WorkspaceSettings({
  health,
}: {
  health: {
    inferenceConfigured: boolean;
    freeCreditsConfirmed: boolean;
  } | null;
}) {
  const [live, setLive] = useState<{
    networks: {
      id: number;
      name: string;
      status: string;
      blockNumber: string | null;
      checkedAt: string;
    }[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("health/live")
      .then(setLive)
      .catch(() => setError("Live network check unavailable."));
  }, []);
  return (
    <section>
      <div className="workspace-heading">
        <div>
          <span className="section-index">Environment / read-only status</span>
          <h1>Workspace settings</h1>
          <p>
            Network reads, optional explanations and reporting integrations.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <article>
          <h2>Network connectivity</h2>
          {error && <p role="alert">{error}</p>}
          {live
            ? live.networks.filter((network) => network.id !== 31337).map((network) => (
                <div className="setting-row" key={network.id}>
                  <strong>{network.name}</strong>
                  <span>
                    {network.status}
                    {network.blockNumber
                      ? ` / block ${network.blockNumber}`
                      : ""}
                  </span>
                </div>
              ))
            : !error && <p role="status">Checking configured RPC endpoints…</p>}
          <p className="muted">
            Checked on request. Public RPC URLs may be rate limited.
          </p>
        </article>
        <article>
          <h2>Integration status</h2>
          <div className="setting-row">
            <strong>Uniswap v4</strong>
            <span>Read-only scans operational when RPC is available</span>
          </div>
          <div className="setting-row">
            <strong>0G explanations</strong>
            <span>
              {health?.inferenceConfigured && health?.freeCreditsConfirmed
                ? "Configured; inspect actual request evidence"
                : "Not configured for existing free credits"}
            </span>
          </div>
          <div className="setting-row">
            <strong>Chainlink CRE</strong>
            <span>Workflow compiled; authenticated simulation pending</span>
          </div>
          <div className="setting-row">
            <strong>Report registry</strong>
            <a href="/app?view=registry">Inspect saved publications</a>
          </div>
          <p>
            <a
              href="https://github.com/gnana2007/Klyro/blob/main/docs/backend-live-plan.md"
              target="_blank"
              rel="noreferrer"
            >
              Environment setup guide <ArrowRight size={14} />
            </a>
          </p>
        </article>
      </div>
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
          onChange={(event) =>
            sessionStorage.setItem("hscan-operator", event.target.value)
          }
        />
      </details>
    </section>
  );
}
function DiffView({ scan }: { scan: Snapshot }) {
  const [history, setHistory] = useState<Snapshot[]>([]),
    [previous, setPrevious] = useState(""),
    [diff, setDiff] = useState<Diff | null>(null),
    [error, setError] = useState("");
  const prior = history.find((item) => item.id === previous);
  const trend = [...history].sort((a, b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : 1);
  useEffect(() => {
    api(`hooks/${scan.chainId}/${scan.address}/history`)
      .then((h) => {
        setHistory(h);
        const earlier = h.filter(
          (s: Snapshot) => s.id !== scan.id && s.scannedAt < scan.scannedAt,
        );
        setPrevious(
          earlier.find(
            (s: Snapshot) => BigInt(s.blockNumber) < BigInt(scan.blockNumber),
          )?.id ||
            earlier[0]?.id ||
            "",
        );
      })
      .catch(() => setError("Historical scans could not be loaded."));
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
      {trend.length > 1 && <div className="trend-panel">
        <div><span className="section-index">Observed trajectory</span><h3>Investigation attention over time</h3><p>Rule-weighted attention index at each saved block. A rise is a reason to investigate, not evidence of malicious behavior.</p></div>
        <svg viewBox="0 0 720 180" role="img" aria-label={`Attention index across ${trend.length} saved observations`}>
          <path d="M 36 145 H 690 M 36 15 V 145" className="trend-axis" />
          <path d={trend.map((item, index) => `${index ? "L" : "M"} ${36 + index * 654 / Math.max(1, trend.length - 1)} ${145 - item.attentionScore * 1.25}`).join(" ")} className="trend-line" />
          {trend.map((item, index) => <g key={item.id}><circle cx={36 + index * 654 / Math.max(1, trend.length - 1)} cy={145 - item.attentionScore * 1.25} r={item.id === scan.id ? 7 : 5} className={item.id === scan.id ? "trend-point current" : "trend-point"}><title>Block {item.blockNumber}: attention {item.attentionScore}/100, {item.findings.length} findings</title></circle></g>)}
          <text x="36" y="169">earlier</text><text x="648" y="169">later</text>
        </svg>
      </div>}
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
      {prior && (
        <div className="snapshot-pair">
          <article>
            <span className="section-index">Previous snapshot</span>
            <strong>Block {prior.blockNumber}</strong>
            <code>{prior.runtimeHash}</code>
            <small>{new Date(prior.scannedAt).toLocaleString()}</small>
          </article>
          <article>
            <span className="section-index">Current snapshot</span>
            <strong>Block {scan.blockNumber}</strong>
            <code>{scan.runtimeHash}</code>
            <small>{new Date(scan.scannedAt).toLocaleString()}</small>
          </article>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {diff ? (
        <>
          <div className="diff-summary">
            <strong>
              {
                diff.changes.filter((change) => change.status === "changed")
                  .length
              }{" "}
              confirmed observation changes
            </strong>
            <span>
              {
                diff.changes.filter(
                  (change) => change.status === "inconclusive",
                ).length
              }{" "}
              inconclusive checks. A change is not itself malicious.
            </span>
          </div>
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
                    <td>
                      <strong>{c.field}</strong>
                      {c.evidenceIds.map((id) => (
                        <a
                          className="evidence-link"
                          key={id}
                          href={
                            "/app?scan=" +
                            scan.id +
                            "&tab=evidence&node=" +
                            encodeURIComponent(id)
                          }
                        >
                          Inspect {id} evidence <ArrowRight size={13} />
                        </a>
                      ))}
                    </td>
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
            <p className="finding-change" key={f.id}>
              <span className="badge">{f.status}</span>{" "}
              <a
                href={
                  "/app?scan=" +
                  scan.id +
                  "&tab=evidence&finding=" +
                  encodeURIComponent(f.id)
                }
              >
                {f.after?.title || f.before?.title}
              </a>
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
      <details className="comparison-history">
        <summary>Browse all {history.length} saved observations</summary>
        <History scans={history} />
      </details>
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
