import { randomUUID } from "node:crypto";
import { parseAbi, type Address, type Hex } from "viem";
import { hash, fingerprints } from "../core/canonical";
import { compareSnapshots } from "../core/diff";
import type { PassportReport } from "../core/types";
import {
  getSnapshot,
  history,
  latestAI,
  savePassport,
  getPassport,
  executions,
} from "./db";
import { scanHook } from "./scan";
import { clientFor } from "./chains";
export const REGISTRY_ABI = parseAbi([
  "function publications(bytes32) view returns (address hook,uint256 chainId,bytes32 fingerprintHash,bytes32 reportHash,uint8 riskLevel,uint64 publishedAt,address publisher)",
  "function latest(bytes32) view returns (bytes32)",
  "function publishers(address) view returns (bool)",
  "event Published(address indexed hook,uint256 indexed chainId,bytes32 indexed reportHash,bytes32 fingerprintHash,uint8 riskLevel,address publisher)",
]);
/** The action a publish transaction would perform, with no side effects. */
export function publicationIntent(passportId: string) {
  const stored = getPassport(passportId);
  if (!stored)
    throw new Error("Passport not found");
  const s = stored.report.snapshot;
  // Deliberately constant. The registry's riskLevel field must not be filled
  // from model output: rules decide severity, and an unpublished passport has
  // no deterministic severity sum to hand. 0 means "not rated by this record".
  const risk = 0;
  return {
    passportId,
    hook: s.address,
    chainId: s.chainId,
    fingerprintHash: s.stateFingerprint as Hex,
    reportHash: stored.reportHash as Hex,
    riskLevel: risk,
    note: "riskLevel is a coarse provenance tag supplied by the publisher, not a safety rating. The registry stores it verbatim.",
  };
}
export function createPassport(scanId: string) {
  const snapshot = getSnapshot(scanId);
  if (!snapshot) throw new Error("Scan not found");
  const prior = history(snapshot.chainId, snapshot.address).filter(
    (s) => s.id !== snapshot.id && s.scannedAt < snapshot.scannedAt,
  )[0];
  const simulation = snapshot.evidence.nodes.some(
    (n) => n.id === "simulation:result",
  )
    ? (executions("simulation").find(
        (r) =>
          r.hook?.toLowerCase() === snapshot.address.toLowerCase() &&
          Number(r.chainId) === snapshot.chainId,
      ) ?? null)
    : null;
  const report: PassportReport = {
    schema: "hscan.passport.v1",
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    snapshot,
    diff: prior ? compareSnapshots(prior, snapshot) : null,
    inference: latestAI(scanId),
    simulation,
    limitations: [
      "A passport is a record of bounded analysis, not a safety certification.",
      "A hash proves integrity against a trusted reference, not the correctness of every observation.",
      "Simulation is attached only when a matching execution was bound to the observed runtime.",
      "CRE execution and registry publication are verified separately; neither is implied by passport creation.",
    ],
  };
  const reportHash = hash(report);
  savePassport(report, reportHash);
  return { report, reportHash };
}
export async function verifyPassport(
  id: string,
  checkCurrent = false,
  supplied?: unknown,
) {
  const stored = getPassport(id);
  if (!stored) throw new Error("Passport not found");
  const computed = hash(supplied ?? stored.report);
  const integrity = computed === stored.reportHash;
  const s = stored.report.snapshot;
  let registry: Record<string, unknown> = {
    status: "UNVERIFIABLE",
    reason: "No registry address configured",
  };
  if (process.env.REGISTRY_ADDRESS) {
    try {
      const record = await clientFor(
        Number(process.env.REGISTRY_CHAIN_ID || 11155111),
      ).readContract({
        address: process.env.REGISTRY_ADDRESS as Address,
        abi: REGISTRY_ABI,
        functionName: "publications",
        args: [stored.reportHash as Hex],
      });
      const match =
        record[0].toLowerCase() === s.address.toLowerCase() &&
        record[1] === BigInt(s.chainId) &&
        record[2] === s.stateFingerprint &&
        record[3] === stored.reportHash &&
        record[5] > 0n;
      registry = {
        status: match ? "MATCH" : "NOT_PUBLISHED_OR_MISMATCH",
        registryAddress: process.env.REGISTRY_ADDRESS,
        chainId: Number(process.env.REGISTRY_CHAIN_ID || 11155111),
        publishedAt: record[5].toString(),
        publisher: record[6],
      };
    } catch {
      registry = { status: "UNVERIFIABLE", reason: "Registry read failed" };
    }
  }
  let current: Record<string, unknown> = { status: "NOT_CHECKED" };
  if (checkCurrent) {
    try {
      const observed = await scanHook({
        chainId: s.chainId,
        address: s.address,
      });
      const comparableFingerprint = fingerprints({
        ...observed,
        analysisVersion: s.analysisVersion,
        config: { owner: observed.owner },
      }).stateFingerprint;
      current = {
        status:
          !s.proxy.resolved || !observed.proxy.resolved
            ? "UNVERIFIABLE"
            : comparableFingerprint === s.stateFingerprint
              ? "MATCH"
              : "CHANGED",
        blockNumber: observed.blockNumber,
        stateFingerprint: comparableFingerprint,
        scannedAnalysisVersion: s.analysisVersion,
        currentAnalysisVersion: observed.analysisVersion,
        reanalysisRecommended: s.analysisVersion !== observed.analysisVersion,
        limitations: observed.limitations,
      };
    } catch {
      current = {
        status: "UNVERIFIABLE",
        reason: "Current chain observation failed",
      };
    }
  }
  return {
    id,
    expectedHash: stored.reportHash,
    computedHash: computed,
    integrity: integrity ? "MATCH" : "MODIFIED",
    authenticity: !integrity
      ? "MODIFIED"
      : registry.status === "MATCH"
        ? "REGISTRY_MATCH"
        : "INTEGRITY_ONLY",
    registry,
    current,
    limitations: [
      "Local hash matching alone is not independent historical authenticity.",
      "A historically authentic report can describe a contract that has since changed.",
      "Current matching covers code, recognized implementations, permissions and owner getter, not every storage slot or dependency.",
    ],
  };
}
