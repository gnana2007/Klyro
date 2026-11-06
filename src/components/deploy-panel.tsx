"use client";
import { useCallback, useEffect, useState } from "react";
import { Rocket, FileCheck2, ExternalLink, TriangleAlert, Check } from "lucide-react";
import { writeContract, type WalletInfo } from "./wallet";
const short = (v: string) => (v.length > 22 ? v.slice(0, 10) + "…" + v.slice(-6) : v);

/**
 * Registry deployment and report publication.
 *
 * Both actions are signed in the operator's own wallet. This panel shows what
 * will be sent, then asks the wallet for approval, then reports only what the
 * server read back from a receipt. Nothing here is enabled while no wallet is
 * connected, and nothing is claimed as done without a confirmed record.
 */

type Chain = { id: number; name: string; deployable: boolean };

const DEPLOY_CHAINS: Chain[] = [
  { id: 11155111, name: "Sepolia", deployable: true },
  { id: 8453, name: "Base", deployable: true },
  { id: 31337, name: "Local Anvil", deployable: true },
  { id: 1, name: "Ethereum mainnet", deployable: false },
];

type Deployment = {
  id: string;
  chainId: number;
  address: string | null;
  txHash: string;
  owner: string;
  deployer: string;
  status: string;
  blockNumber: string | null;
  gasUsed: string | null;
  codeSize: number | null;
  verified: number;
  error: string | null;
  createdAt: string;
};

type Publication = {
  id: string;
  chainId: number;
  registry: string;
  hook: string;
  reportHash: string;
  fingerprintHash: string;
  riskLevel: number;
  passportId: string | null;
  txHash: string;
  publisher: string;
  status: string;
  blockNumber: string | null;
  gasUsed: string | null;
  error: string | null;
  createdAt: string;
};

async function get(path: string) {
  const r = await fetch("/api/" + path, { cache: "no-store" });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error || "Request failed");
  return v;
}
async function post(path: string, body: unknown) {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-operator-token": sessionStorage.getItem("hscan-operator") || "",
    },
    body: JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error || "Request failed");
  return v;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : // Only reached on a very old browser without Web Crypto. The server
      // rejects a non-UUID id, which surfaces as an input error rather than a
      // wrong record.
      "";

function Status({ status }: { status: string }) {
  const kind =
    status === "deployed" || status === "published"
      ? "ok"
      : status === "reverted" || status === "unconfirmed-onchain"
        ? "error"
        : "wait";
  return <span className={"record-status record-" + kind}>{status}</span>;
}

export default function DeployPanel({ wallet }: { wallet: WalletInfo | null }) {
  const [chainId, setChainId] = useState(11155111);
  const [records, setRecords] = useState<{
    deployments: Deployment[];
    publications: Publication[];
  }>({ deployments: [], publications: [] });
  const [prepared, setPrepared] = useState<{
    contract: string;
    solcVersion: string;
    bytecodeBytes: number;
    constructorArgs: { name: string; type: string; value: string }[];
    chain: { id: number; name: string; chainIdMatches: boolean | null; blockNumber: string | null };
    deployable: boolean;
    feeData: { gasPrice: string | null };
    notes: string[];
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastDeployment, setLastDeployment] = useState<Deployment | null>(null);
  const [verification, setVerification] = useState<{
    checked: boolean;
    verified?: boolean;
    reason?: string;
  } | null>(null);
  const [registry, setRegistry] = useState<{
    configured: boolean;
    address: string | null;
    chainName: string | null;
    explorerBase: string | null;
    notice: string;
    chain: {
      owner: string | null;
      forwarder: string | null;
      codeSize: number;
      blockNumber: string;
    } | null;
  } | null>(null);

  const refresh = useCallback(() => {
    get("deploy/records").then(setRecords).catch(() => {});
    get("registry/state").then(setRegistry).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (!wallet) {
      setPrepared(null);
      return;
    }
    get("deploy/prepare?chainId=" + chainId + "&owner=" + wallet.address)
      .then(setPrepared)
      .catch((e) => {
        setPrepared(null);
        setError(e.message);
      });
  }, [chainId, wallet]);

  async function deploy() {
    if (!wallet || !prepared) return;
    setError("");
    setBusy("Deploying");
    try {
      const artifact = await get("deploy/artifact");
      // The wallet shows its own confirmation screen. This call returns only
      // after approval, and only with a transaction hash.
      const { encodeDeployData } = await import("viem");
      const data = encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: [wallet.address],
      });
      const p = (window as unknown as { ethereum: { request(a: unknown): Promise<unknown> } })
        .ethereum;
      const txHash = (await p.request({
        method: "eth_sendTransaction",
        params: [{ from: wallet.address, data }],
      })) as `0x${string}`;
      const id = newId();
      setBusy("Waiting for the receipt");
      const record = await post("deploy/confirm", {
        id,
        chainId,
        txHash,
        owner: wallet.address,
        deployer: wallet.address,
      });
      setLastDeployment(record);
      refresh();
    } catch (e) {
      const code = (e as { code?: number }).code;
      setError(
        code === 4001
          ? "You rejected the deployment in your wallet. Nothing was sent."
          : (e as Error).message,
      );
    } finally {
      setBusy("");
    }
  }

  async function checkVerification(record: Deployment) {
    if (!record.address) return;
    setVerification(await get("deploy/verification/" + record.chainId + "/" + record.address));
  }

  return (
    <section className="deploy">
      <div className="page-title">
        <Rocket />
        <div>
          <h1>Registry deployment and publication</h1>
          <p>
            One contract, deployed and published to by your own wallet. Klyro
            shows the prepared transaction and then the receipt — nothing else.
          </p>
        </div>
      </div>

      <div className="deploy-grid">
        <div className="panel">
          <h2>1. Deploy HookRiskRegistry</h2>
          <div className="field-row">
            <label>
              Network
              <select
                value={chainId}
                onChange={(e) => setChainId(Number(e.target.value))}
              >
                {DEPLOY_CHAINS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.deployable ? "" : " (manual)"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {prepared ? (
            <dl className="facts">
              <div>
                <dt>Contract</dt>
                <dd>
                  {prepared.contract} · solc {prepared.solcVersion} ·{" "}
                  {prepared.bytecodeBytes} bytes
                </dd>
              </div>
              <div>
                <dt>Constructor</dt>
                <dd>
                  <code>{prepared.constructorArgs[0].name}</code> ={" "}
                  <code>{short(prepared.constructorArgs[0].value)}</code> (your
                  connected address)
                </dd>
              </div>
              <div>
                <dt>Chain</dt>
                <dd>
                  {prepared.chain.name} ·{" "}
                  {prepared.chain.chainIdMatches === null
                    ? "RPC unreachable"
                    : prepared.chain.chainIdMatches
                      ? "chain id verified against the RPC"
                      : "RPC reports a different chain"}{" "}
                  {prepared.chain.blockNumber &&
                    "· block " + prepared.chain.blockNumber}
                </dd>
              </div>
              <div>
                <dt>Gas price now</dt>
                <dd>
                  {prepared.feeData.gasPrice
                    ? prepared.feeData.gasPrice + " wei"
                    : "unavailable"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="muted">
              {wallet
                ? "Preparing…"
                : "Connect a wallet to prepare a deployment. Read-only analysis does not need one."}
            </p>
          )}
          <ul className="notes">
            {prepared?.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <button
            className="primary"
            type="button"
            disabled={!wallet || !prepared?.deployable || !!busy}
            onClick={deploy}
          >
            {busy || "Deploy with wallet"}
          </button>
          {error && (
            <p className="notice error" role="alert">
              <TriangleAlert size={14} /> {error}
            </p>
          )}
        </div>

        <div className="panel">
          <h2>2. What is deployed right now</h2>
          {registry ? (
            <>
              <dl className="facts">
                <div>
                  <dt>Configured registry</dt>
                  <dd>
                    {registry.address ? (
                      <code>{registry.address}</code>
                    ) : (
                      "none"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Chain</dt>
                  <dd>{registry.chainName ?? "unknown"}</dd>
                </div>
                {registry.chain ? (
                  <>
                    <div>
                      <dt>On-chain owner</dt>
                      <dd>
                        <code>{registry.chain.owner ?? "not readable"}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>CRE forwarder</dt>
                      <dd>
                        <code>
                          {registry.chain.forwarder &&
                          registry.chain.forwarder !==
                            "0x0000000000000000000000000000000000000000"
                            ? registry.chain.forwarder
                            : "not set"}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>Code size</dt>
                      <dd>
                        {registry.chain.codeSize} bytes at block{" "}
                        {registry.chain.blockNumber}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <p className="notice">{registry.notice}</p>
            </>
          ) : (
            <p className="muted">Reading registry state…</p>
          )}
          {lastDeployment && (
            <div className="record">
              <h3>
                <Status status={lastDeployment.status} /> Latest deployment
              </h3>
              <dl className="facts">
                <div>
                  <dt>Address</dt>
                  <dd>
                    <code>{lastDeployment.address ?? "not deployed"}</code>
                  </dd>
                </div>
                <div>
                  <dt>Transaction</dt>
                  <dd>
                    <code>{short(lastDeployment.txHash)}</code>
                  </dd>
                </div>
                <div>
                  <dt>Block · gas</dt>
                  <dd>
                    {lastDeployment.blockNumber ?? "—"} ·{" "}
                    {lastDeployment.gasUsed ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>owner() read-back</dt>
                  <dd>
                    {lastDeployment.verified
                      ? "matches the deployer"
                      : "could not confirm"}
                  </dd>
                </div>
              </dl>
              <div className="button-row">
                {lastDeployment.address && registry?.explorerBase && (
                  <a
                    className="quiet"
                    href={registry.explorerBase + "/address/" + lastDeployment.address}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Explorer <ExternalLink size={13} />
                  </a>
                )}
                <button
                  className="quiet"
                  type="button"
                  onClick={() => checkVerification(lastDeployment)}
                >
                  Check source verification
                </button>
              </div>
              {verification && (
                <p className="muted">
                  {verification.checked
                    ? verification.verified
                      ? "Source is verified on the explorer."
                      : "Explorer reports no verified source yet."
                    : verification.reason}
                </p>
              )}
              {lastDeployment.address && (
                <p className="next-step">
                  Next: set <code>REGISTRY_ADDRESS={lastDeployment.address}</code>{" "}
                  and <code>REGISTRY_CHAIN_ID={lastDeployment.chainId}</code> in
                  the server environment, then restart. Publication below reads
                  that configuration.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <PublishPanel wallet={wallet} registry={registry} onPublished={refresh} />
    </section>
  );
}

function PublishPanel({
  wallet,
  registry,
  onPublished,
}: {
  wallet: WalletInfo | null;
  registry: {
    configured: boolean;
    address: string | null;
    chainId?: number;
    chain: { owner: string | null } | null;
    notice: string;
  } | null;
  onPublished: () => void;
}) {
  const [passports, setPassports] = useState<
    { id: string; report_hash: string; created_at: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Publication | null>(null);

  useEffect(() => {
    get("registry")
      .then((d) => setPassports(d.passports))
      .catch(() => {});
  }, []);

  const isOwner =
    !!wallet &&
    !!registry?.chain?.owner &&
    registry.chain.owner.toLowerCase() === wallet.address.toLowerCase();

  async function publish(passportId: string) {
    if (!wallet) return;
    setError("");
    setBusy(true);
    setResult(null);
    try {
      const intent = await get("passports/" + passportId + "/publication-intent");
      const artifact = await get("deploy/artifact");
      const txHash = await writeContract({
        abi: artifact.abi,
        address: registry!.address as `0x${string}`,
        functionName: "publish",
        args: [
          intent.hook,
          BigInt(intent.chainId),
          intent.fingerprintHash,
          intent.reportHash,
          intent.riskLevel,
        ],
        from: wallet.address,
        chainId: (registry!.chainId as number) ?? wallet.chainId,
      });
      setBusy(true);
      const record = await post("deploy/publish-confirm", {
        id: newId(),
        chainId: (registry!.chainId as number) ?? wallet.chainId,
        registry: registry!.address,
        hook: intent.hook,
        reportHash: intent.reportHash,
        fingerprintHash: intent.fingerprintHash,
        riskLevel: intent.riskLevel,
        passportId,
        txHash,
        publisher: wallet.address,
      });
      setResult(record);
      onPublished();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel publish">
      <h2>3. Publish a saved passport</h2>
      <p className="muted">
        Publishing writes the report hash and state fingerprint on chain. It
        proves who published which report for which version — not that the hook
        is safe.
      </p>
      {registry?.configured ? (
        <p className="muted">
          Registry <code>{registry.address}</code>
          {registry.chain?.owner && (
            <>
              {" "}
              · on-chain owner <code>{short(registry.chain.owner)}</code>
            </>
          )}
        </p>
      ) : (
        <p className="notice">
          No registry is configured on this server. Deploy one above, then set
          REGISTRY_ADDRESS and restart. Reverted publications are possible
          before that, but nothing would be recorded.
        </p>
      )}
      {wallet && registry?.configured && (
        <p className="notice">
          {isOwner
            ? "Your connected address is the registry owner, so it can publish."
            : "Your connected address is not the registry owner. Only an authorized publisher can publish; the transaction will revert otherwise."}
        </p>
      )}
      {!passports.length ? (
        <p className="muted">
          No saved passports yet. Scan a hook and choose “Save passport”.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Passport</th>
                <th>Report hash</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {passports.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a href={"/passport/" + p.id}>{short(p.id)}</a>
                  </td>
                  <td>
                    <code>{short(p.report_hash)}</code>
                  </td>
                  <td>{new Date(p.created_at).toUTCString()}</td>
                  <td>
                    <button
                      className="quiet"
                      type="button"
                      disabled={busy || !wallet || !registry?.configured}
                      onClick={() => publish(p.id)}
                    >
                      <FileCheck2 size={14} /> Publish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          <TriangleAlert size={14} /> {error}
        </p>
      )}
      {result && (
        <div className="record">
          <h3>
            {result.status === "published" ? (
              <Check size={16} />
            ) : (
              <TriangleAlert size={16} />
            )}{" "}
            <Status status={result.status} />
          </h3>
          <dl className="facts">
            <div>
              <dt>Transaction</dt>
              <dd>
                <code>{result.txHash}</code>
              </dd>
            </div>
            <div>
              <dt>Block · gas</dt>
              <dd>
                {result.blockNumber ?? "—"} · {result.gasUsed ?? "—"}
              </dd>
            </div>
            {result.error && (
              <div>
                <dt>Note</dt>
                <dd>{result.error}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
