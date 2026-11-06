"use client";
import { useState, useEffect } from "react";
import type { PassportReport } from "@/core/types";
import { hash } from "@/core/canonical";
export default function PassportView({ id }: { id: string }) {
  const [data, setData] = useState<{
      report: PassportReport;
      reportHash: string;
    } | null>(null),
    [verification, setVerification] = useState<Record<string, unknown> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [browserHash, setBrowserHash] = useState("");
  useEffect(() => {
    fetch("/api/passports/" + id)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
        setBrowserHash(hash(d.report));
      })
      .catch((e) => setError(e.message));
  }, [id]);
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/verify/" + id + "?current=true");
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setVerification(v);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="passport">
      <div className="section-head">
        <h2>Hook passport</h2>
        <a className="quiet" href={"/api/passports/" + id} download>
          Download report JSON
        </a>
      </div>
      <p>A reproducible analysis record for one observed chain state.</p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">Loading report…</p>
      ) : (
        <>
          <div className="facts">
            <div className="fact">
              <span>Hook</span>
              <code>{data.report.snapshot.address}</code>
            </div>
            <div className="fact">
              <span>Chain / block</span>
              <code>
                {data.report.snapshot.chainId} /{" "}
                {data.report.snapshot.blockNumber}
              </code>
            </div>
            <div className="fact">
              <span>Canonical report hash</span>
              <code>{data.reportHash}</code>
            </div>
            <div className="fact">
              <span>Recalculated in your browser</span>
              <code>{browserHash}</code>
            </div>
            <div className="fact">
              <span>Browser integrity check</span>
              <strong>
                {browserHash === data.reportHash ? "MATCH" : "MODIFIED"}
              </strong>
            </div>
            <div className="fact">
              <span>AI provider request ID</span>
              <code>
                {data.report.inference?.requestId ??
                  "No successful inference reference"}
              </code>
            </div>
          </div>
          <div className="passport-actions">
            <button
              className="primary"
              onClick={verify}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Verifying…" : "Verify registry and current contract"}
            </button>
            <a className="quiet" href={"/passport/" + id}>
              Public passport URL
            </a>
          </div>
          {verification && (
            <>
              <div className="verification-grid">
                <article>
                  <h3>Is this report authentic?</h3>
                  <strong>{String(verification.authenticity)}</strong>
                  <p>
                    Integrity alone requires a trusted reference. Registry
                    comparison is reported separately.
                  </p>
                </article>
                <article>
                  <h3>Does the current contract match?</h3>
                  <strong>
                    {String(
                      (verification.current as Record<string, unknown>)?.status,
                    )}
                  </strong>
                  <p>
                    A changed contract does not invalidate the historical
                    report.
                  </p>
                </article>
              </div>
              <pre className="code-block">
                {JSON.stringify(verification, null, 2)}
              </pre>
            </>
          )}
          <details>
            <summary>Independently check another report file</summary>
            <p>
              Choose an exported report or its JSON wrapper to calculate its
              hash locally in this browser.
            </p>
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Report JSON file"
              onChange={async (e) => {
                try {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 2000000) throw new Error("File too large");
                  const value = JSON.parse(await f.text());
                  const computed = hash(value.report ?? value);
                  setBrowserHash(computed);
                } catch {
                  setError("Unable to hash this report JSON.");
                }
              }}
            />
          </details>
          <details>
            <summary>Complete canonical report</summary>
            <pre className="code-block">
              {JSON.stringify(data.report, null, 2)}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
