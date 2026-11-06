import { describe, it, expect } from "vitest";
import {
  decodePermissions,
  validPermissionDependencies,
} from "../src/core/permissions";
import { canonical, hash, fingerprints } from "../src/core/canonical";
import { analyze, assertEvidence, inspectOpcodes } from "../src/core/analysis";
import { compareSnapshots } from "../src/core/diff";
import { validateExplanation } from "../src/server/ai";
import { snapshot } from "./fixtures";
describe("official Uniswap address flags", () => {
  for (let bit = 0; bit < 14; bit++)
    it("decodes isolated flag " + bit, () => {
      const p = decodePermissions("0x" + (1n << BigInt(bit)).toString(16));
      expect(p).toHaveLength(14);
      expect(p.filter((x) => x.enabled)).toHaveLength(1);
      expect(p.find((x) => x.enabled)?.bit).toBe(bit);
    });
  it("decodes all combinations without high address bits leaking", () => {
    expect(
      decodePermissions("0x1234567890123456789012345678901234567fff").every(
        (p) => p.enabled,
      ),
    ).toBe(true);
    expect(decodePermissions("0x4000").some((p) => p.enabled)).toBe(false);
  });
  it("rejects delta flags without callback and accepts valid combinations", () => {
    expect(validPermissionDependencies(decodePermissions("0x4"))).toBe(false);
    expect(validPermissionDependencies(decodePermissions("0x44"))).toBe(true);
    expect(validPermissionDependencies(decodePermissions("0xc4"))).toBe(true);
  });
});
describe("canonical identities", () => {
  it("is independent of object insertion order", () => {
    expect(canonical({ z: [2, 1], a: { b: true, a: null } })).toBe(
      canonical({ a: { a: null, b: true }, z: [2, 1] }),
    );
    expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }));
  });
  it("rejects nondeterministic unsupported values", () => {
    expect(() => canonical({ x: undefined })).toThrow();
    expect(() => canonical(NaN)).toThrow();
    expect(() => canonical(1n)).toThrow();
  });
  it("is stable for identical fingerprint inputs", () => {
    const s = snapshot();
    expect(fingerprints(s)).toEqual(fingerprints(s));
  });
  for (const [field, value] of [
    ["runtimeHash", "0x" + "33".repeat(32)],
    ["permissionBitmap", 128],
    ["analysisVersion", "v2"],
    ["chainId", 1],
  ] as const)
    it("changes state fingerprint for " + field, () => {
      const s = snapshot();
      expect(fingerprints({ ...s, [field]: value }).stateFingerprint).not.toBe(
        fingerprints(s).stateFingerprint,
      );
    });
  it("changes observation identity, not contract state, for new blocks", () => {
    const s = snapshot(),
      a = fingerprints(s),
      b = fingerprints({ ...s, blockNumber: "2" });
    expect(a.stateFingerprint).toBe(b.stateFingerprint);
    expect(a.observationFingerprint).not.toBe(b.observationFingerprint);
  });
  it("detects report tampering", () => {
    expect(hash({ report: snapshot() })).not.toBe(
      hash({ report: { ...snapshot(), codeSize: 11 } }),
    );
  });
});
describe("evidence and rules", () => {
  it("links each finding to real evidence nodes", () => {
    const s = analyze(snapshot());
    expect(() => assertEvidence(s)).not.toThrow();
    expect(s.findings.find((f) => f.id === "CAP-DELTA")?.severity).toBe("info");
  });
  it("rejects missing references and graph endpoints", () => {
    const s = analyze(snapshot());
    s.findings[0].evidenceIds = ["absent"];
    expect(() => assertEvidence(s)).toThrow();
    const other = analyze(snapshot());
    other.evidence.edges.push({
      from: "absent",
      to: "hook",
      type: "HAS_PERMISSION",
    });
    expect(() => assertEvidence(other)).toThrow();
  });
  it("does not scan PUSH data as executed opcodes", () => {
    expect(inspectOpcodes("0x60f4").callOpcodes).toBe(0);
    expect(inspectOpcodes("0xf4").callOpcodes).toBe(1);
  });
});
describe("historical comparison", () => {
  it("does not mistake finding timestamps for behavioral changes", () => {
    const a = analyze(snapshot()),
      b = structuredClone(a);
    b.blockNumber = "2";
    b.blockTimestamp = "2026-11-06T00:00:12.000Z";
    for (const f of b.findings) {
      f.blockNumber = "2";
      f.timestamp = b.blockTimestamp;
    }
    const d = compareSnapshots(a, b);
    expect(d.findings.find((f) => f.id === "CAP-DELTA")?.status).toBe(
      "unchanged",
    );
  });
  it("distinguishes an implementation update from stable proxy code", () => {
    const a = analyze(snapshot()),
      b = structuredClone(a);
    b.id = "new";
    b.blockNumber = "2";
    b.proxy = {
      ...b.proxy,
      kind: "eip1967",
      implementation: "0x" + "33".repeat(20),
      implementationHash: "0x" + "44".repeat(32),
    };
    const d = compareSnapshots(a, b);
    expect(d.changes.find((c) => c.field === "runtimeHash")?.status).toBe(
      "unchanged",
    );
    expect(
      d.changes.find((c) => c.field === "proxy.implementation")?.status,
    ).toBe("changed");
  });
  it("never calls an unresolved implementation unchanged", () => {
    const a = analyze(snapshot()),
      b = structuredClone(a);
    b.proxy.resolved = false;
    expect(
      compareSnapshots(a, b).changes.find(
        (c) => c.field === "proxy.implementationHash",
      )?.status,
    ).toBe("inconclusive");
  });
  it("does not resolve a finding when source evidence is missing", () => {
    const a = analyze(snapshot()),
      b = structuredClone(a);
    b.findings = [];
    expect(
      compareSnapshots(a, b).findings.every(
        (f) => f.status === "requires-reassessment",
      ),
    ).toBe(true);
  });
  it("rejects unrelated hooks and reversed blocks", () => {
    const a = snapshot();
    expect(() => compareSnapshots(a, { ...a, chainId: 1 })).toThrow();
    expect(() => compareSnapshots({ ...a, blockNumber: "3" }, a)).toThrow();
  });
});
describe("AI evidence boundaries", () => {
  function output() {
    const s = analyze(snapshot());
    return {
      s,
      o: {
        executiveSummary: "Observed capabilities",
        technicalExplanation: "Bounded analysis",
        findings: s.findings.map((f) => ({
          findingId: f.id,
          explanation: f.explanation,
          evidenceIds: f.evidenceIds,
          potentialImpact: "Requires investigation",
          confidence: 0.5,
        })),
        missingEvidence: ["Source"],
        recommendedInvestigation: ["Review source"],
        limitations: ["Not an audit"],
      },
    };
  }
  it("accepts explanations grounded in each finding evidence", () => {
    const { s, o } = output();
    expect(validateExplanation(o, s)).toEqual(o);
  });
  it("rejects invented evidence or vulnerabilities", () => {
    const { s, o } = output();
    o.findings[0].evidenceIds = ["invented"];
    expect(() => validateExplanation(o, s)).toThrow();
    const b = output();
    b.o.findings[0].findingId = "invented";
    expect(() => validateExplanation(b.o, b.s)).toThrow();
  });
  it("rejects severity injection", () => {
    const { s, o } = output();
    expect(() => validateExplanation({ ...o, severity: "safe" }, s)).toThrow();
  });
  it("rejects duplicate explanations", () => {
    const { s, o } = output();
    o.findings.push(o.findings[0]);
    expect(() => validateExplanation(o, s)).toThrow();
  });
});
