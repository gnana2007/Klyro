import { canonical, hash } from "./canonical";
import type { Snapshot, Diff, Finding } from "./types";
export function compareSnapshots(previous: Snapshot, current: Snapshot): Diff {
  if (
    previous.chainId !== current.chainId ||
    previous.address.toLowerCase() !== current.address.toLowerCase()
  )
    throw new Error("Compare snapshots of the same hook and chain");
  if (BigInt(current.blockNumber) < BigInt(previous.blockNumber))
    throw new Error("Current block precedes previous block");
  const fields = [
    "runtimeHash",
    "codeSize",
    "permissionBitmap",
    "owner",
    "dependencies",
    "stateFingerprint",
  ] as const;
  const changes: Diff["changes"] = fields.map((field) => ({
    field,
    before: previous[field],
    after: current[field],
    status:
      canonical(previous[field]) === canonical(current[field])
        ? "unchanged"
        : "changed",
    evidenceIds: [
      field === "owner"
        ? "owner"
        : field === "permissionBitmap"
          ? "permissions"
          : "bytecode",
    ],
  }));
  for (const field of [
    "implementation",
    "implementationHash",
    "admin",
    "beacon",
  ] as const)
    changes.push({
      field: "proxy." + field,
      before: previous.proxy[field],
      after: current.proxy[field],
      status:
        !previous.proxy.resolved || !current.proxy.resolved
          ? "inconclusive"
          : previous.proxy[field] === current.proxy[field]
            ? "unchanged"
            : "changed",
      evidenceIds: ["proxy"],
    });

  // Investigation facts. These describe what was observed, not what the
  // contract became, so a change here means the record changed — which is
  // exactly the kind of difference a reader must not have to go looking for.
  // Deployment is inconclusive when either side is UNKNOWN: an unobserved
  // deployer must never read as "the deployer changed".
  const deploymentBefore = previous.deployment ?? null;
  const deploymentAfter = current.deployment ?? null;
  changes.push({
    field: "deployment.deployer",
    before: deploymentBefore?.deployer ?? "UNKNOWN",
    after: deploymentAfter?.deployer ?? "UNKNOWN",
    status:
      deploymentBefore?.status !== "OBSERVED" ||
      deploymentAfter?.status !== "OBSERVED"
        ? "inconclusive"
        : deploymentBefore?.deployer === deploymentAfter?.deployer
          ? "unchanged"
          : "changed",
    evidenceIds: ["hook"],
  });
  changes.push({
    field: "hookStatus",
    before: previous.hookStatus ?? "UNKNOWN",
    after: current.hookStatus ?? "UNKNOWN",
    status:
      !previous.hookStatus || !current.hookStatus
        ? "inconclusive"
        : previous.hookStatus === current.hookStatus
          ? "unchanged"
          : "changed",
    evidenceIds: ["pool"],
  });
  changes.push({
    field: "participants",
    before: (previous.participants ?? [])
      .map((p) => p.role + ":" + p.address)
      .sort(),
    after: (current.participants ?? [])
      .map((p) => p.role + ":" + p.address)
      .sort(),
    status:
      canonical(
        (previous.participants ?? [])
          .map((p) => p.role + ":" + p.address)
          .sort(),
      ) ===
      canonical(
        (current.participants ?? [])
          .map((p) => p.role + ":" + p.address)
          .sort(),
      )
        ? "unchanged"
        : "changed",
    evidenceIds: ["hook"],
  });
  const before = new Map(previous.findings.map((f) => [f.id, f]));
  const after = new Map(current.findings.map((f) => [f.id, f]));
  const rank = { info: 0, low: 1, medium: 2, high: 3 };
  const findings: Diff["findings"] = [
    ...new Set([...before.keys(), ...after.keys()]),
  ]
    .sort()
    .map((id) => {
      const a = before.get(id),
        b = after.get(id);
      let status: Diff["findings"][number]["status"];
      if (
        a?.status === "UNKNOWN" ||
        b?.status === "UNKNOWN" ||
        previous.analysisVersion !== current.analysisVersion
      )
        status = "requires-reassessment";
      else if (!a) status = "new";
      else if (!b)
        status =
          current.source.status === "UNKNOWN"
            ? "requires-reassessment"
            : "resolved";
      else if (rank[b.severity] > rank[a.severity]) status = "worsened";
      else
        status =
          comparable(a, previous) === comparable(b, current)
            ? "unchanged"
            : "changed";
      return {
        id,
        status,
        ...(a ? { before: a } : {}),
        ...(b ? { after: b } : {}),
      };
    });
  return {
    schema: "hscan.diff.v1",
    id: hash({ previousId: previous.id, currentId: current.id }),
    previousId: previous.id,
    currentId: current.id,
    changes,
    findings,
    limitations: [
      "Hash changes are not proof of malicious behavior or semantic differences.",
      "Address-derived permissions remain constant for the same address.",
      "Unknown observations cannot prove that a finding resolved.",
      "Only monitored state and detected dependencies are compared.",
    ],
  };
}
function comparable(f: Finding, s: Snapshot) {
  const { blockNumber, timestamp, ...content } = f;
  return canonical({
    finding: content,
    evidence: f.evidenceIds.map((id) => {
      const n = s.evidence.nodes.find((n) => n.id === id);
      return n
        ? { id: n.id, status: n.status, method: n.method, data: n.data }
        : null;
    }),
  });
}
