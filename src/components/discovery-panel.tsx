"use client";
import { useEffect, useState } from "react";

type Discovery = {
  fromBlock: string;
  toBlock: string;
  hooks: { address: string; firstSeenBlock: string; lastSeenBlock: string; pools: number }[];
  notice: string;
};
type Monitor = { chainId: number; hookAddress: string; enabled: boolean; intervalMinutes: number; lastRunStatus: string | null; lastRunBlock: string | null; lastError: string | null; nextRunAt: string | null };

export default function DiscoveryPanel({ request, onSelect }: {
  request: (path: string, data?: unknown) => Promise<any>;
  onSelect: (address: string, fromBlock: string, ensName?: string) => void;
}) {
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ens, setEns] = useState("");
  const [interval, setIntervalMinutes] = useState(60);
  const [windowBlocks, setWindowBlocks] = useState(2000);
  async function refreshMonitors() {
    try { const data = await request("monitors"); setMonitors((data.monitors ?? []).filter((item: Monitor) => item.chainId === 11155111)); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void refreshMonitors(); }, []);
  async function discover() {
    setLoading(true); setError(""); setMessage("");
    try { setDiscovery(await request(`discover/sepolia?blocks=${windowBlocks}`)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  async function resolve() {
    setPending("ens"); setError(""); setMessage("");
    try {
      const result = await request("ens/resolve?name=" + encodeURIComponent(ens));
      onSelect(result.address, "", result.name);
      setMessage(`${result.name} resolves to ${result.address} on Ethereum mainnet. Verify code on the selected scan network.`);
    } catch (e) { setError((e as Error).message); }
    finally { setPending(""); }
  }
  async function monitor(address: string) {
    setPending(address); setError(""); setMessage("");
    try {
      await request("monitors", { chainId: 11155111, address, intervalMinutes: interval });
      setMessage(`Monitoring ${address} on Sepolia every ${interval} minutes. Initial run will occur when the scheduler ticks.`);
      await refreshMonitors();
    } catch (e) { setError((e as Error).message); }
    finally { setPending(""); }
  }
  async function changeMonitor(item: Monitor, action: "toggle" | "remove") {
    setPending(item.hookAddress); setError(""); setMessage("");
    try {
      if (action === "remove") await request("monitors/remove", { chainId: item.chainId, address: item.hookAddress });
      else await request("monitors/toggle", { chainId: item.chainId, address: item.hookAddress, enabled: !item.enabled });
      setMessage(action === "remove" ? "Monitoring ended. Saved scan history remains available." : item.enabled ? "Monitoring paused. Existing observations remain available." : "Monitoring resumed. The scheduler will check this hook on its next tick.");
      await refreshMonitors();
    } catch (e) { setError((e as Error).message); }
    finally { setPending(""); }
  }
  return <section className="discovery-panel" aria-label="Sepolia hook discovery">
    <div className="section-head"><div><span className="section-index">Sepolia / live discovery</span><h2>Find hooks without an address</h2></div><button type="button" className="quiet" onClick={discover} disabled={loading}>{loading ? "Reading PoolManager logs…" : "Discover recent hooks"}</button></div>
    <p>Read actual Uniswap v4 PoolManager initialization events from a recent Sepolia block window. Select a hook to investigate or start interval monitoring.</p>
    <label className="discovery-window">Search window <select value={windowBlocks} onChange={(event) => setWindowBlocks(Number(event.target.value))}><option value={2000}>2,000 blocks</option><option value={5000}>5,000 blocks</option><option value={10000}>10,000 blocks</option></select></label>
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {discovery && <>
      <p className="muted">Observed blocks <code>{discovery.fromBlock}–{discovery.toBlock}</code>. {discovery.hooks.length} distinct hook address{discovery.hooks.length === 1 ? "" : "es"} in this window.</p>
      {discovery.hooks.length ? <div className="discovery-list">{discovery.hooks.map((hook) => <article key={hook.address}>
        <code title={hook.address}>{hook.address}</code><span>{hook.pools} pool initialization{hook.pools === 1 ? "" : "s"} · last seen block {hook.lastSeenBlock}</span>
        <div className="inline"><button type="button" className="quiet" onClick={() => onSelect(hook.address, hook.firstSeenBlock)}>Use in investigation</button><button type="button" className="quiet" disabled={pending === hook.address} onClick={() => monitor(hook.address)}>{pending === hook.address ? "Saving…" : "Monitor hook"}</button></div>
      </article>)}</div> : <p className="notice">No nonzero hook address appeared in this bounded window. Try again later or enter an address or ENS name below.</p>}
      <p className="muted">{discovery.notice}</p>
    </>}
    <div className="discovery-controls"><label>Monitoring interval (minutes)<input type="number" min="5" max="10080" value={interval} onChange={(event) => setIntervalMinutes(Number(event.target.value))} /></label><label>ENS name or subname<input value={ens} onChange={(event) => setEns(event.target.value)} placeholder="v1.company.eth" /></label><button type="button" className="quiet" disabled={!ens.trim() || pending === "ens"} onClick={resolve}>Resolve ENS</button></div>
    <p className="muted">ENS lookup reads an existing Ethereum mainnet address record. Klyro cannot create <code>v1.company.eth</code> unless the parent namespace owner sets that record.</p>
    {monitors.length > 0 && <details><summary>{monitors.length} monitored hook{monitors.length === 1 ? "" : "s"}</summary><div className="discovery-list">{monitors.map((item) => <article key={`${item.chainId}:${item.hookAddress}`}><code>{item.hookAddress}</code><span>{item.enabled ? "Active" : "Paused"} · every {item.intervalMinutes} min · last run {item.lastRunStatus ?? "pending"}{item.lastRunBlock ? ` at block ${item.lastRunBlock}` : ""}{item.nextRunAt ? ` · next ${new Date(item.nextRunAt).toLocaleString()}` : ""}</span>{item.lastError && <span className="notice error">{item.lastError}</span>}<div className="inline"><button type="button" className="quiet" onClick={() => onSelect(item.hookAddress, "")}>Open hook</button><button type="button" className="quiet" disabled={pending === item.hookAddress} onClick={() => changeMonitor(item, "toggle")}>{item.enabled ? "Pause" : "Resume"}</button><button type="button" className="quiet" disabled={pending === item.hookAddress} onClick={() => changeMonitor(item, "remove")}>End monitoring</button></div></article>)}</div></details>}
  </section>;
}
