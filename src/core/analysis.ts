import { ANALYSIS_VERSION } from "./canonical";
import type { Snapshot, Finding, EvidenceNode, Severity } from "./types";
const weights: Record<Severity, number> = {
  info: 0,
  low: 5,
  medium: 15,
  high: 30,
};
export function analyze(snapshot: Snapshot): Snapshot {
  const findings: Finding[] = [];
  const nodes = [...snapshot.evidence.nodes];
  const edges = [...snapshot.evidence.edges];
  function add(
    ruleId: string,
    title: string,
    severity: Severity,
    category: Finding["category"],
    evidenceIds: string[],
    explanation: string,
    investigation: string,
    status: Finding["status"] = "OBSERVED",
    confidence: Finding["confidence"] = "high",
  ) {
    const finding: Finding = {
      id: ruleId,
      ruleId,
      title,
      severity,
      category,
      evidenceIds,
      explanation,
      investigation,
      status,
      confidence,
      analysisVersion: ANALYSIS_VERSION,
      limitations: [
        "An indicator or capability is not a confirmed vulnerability.",
      ],
    };
    findings.push(finding);
    nodes.push({
      ...nodes[0],
      id: "finding:" + ruleId,
      type: "Risk finding",
      label: title,
      status,
      method: ruleId,
      data: { severity, category },
      limitations: finding.limitations,
    });
    for (const id of evidenceIds)
      edges.push({
        from: id,
        to: "finding:" + ruleId,
        type: "SUPPORTS_FINDING",
      });
  }
  const delta = snapshot.permissions.filter(
    (p) => p.enabled && p.name.endsWith("ReturnDelta"),
  );
  if (delta.length)
    add(
      "CAP-DELTA",
      "Return-delta accounting enabled",
      "info",
      "capability",
      delta.map((p) => "permission:" + p.name),
      "The address enables callbacks that can return accounting deltas. This is a protocol capability.",
      "Review callback code and compare controlled balance changes.",
    );
  if (!snapshot.permissionValid)
    add(
      "HOOK-FLAGS",
      "Invalid permission dependencies",
      "high",
      "security-indicator",
      ["permissions"],
      "A return-delta flag lacks its required callback flag. The official PoolManager rejects this combination.",
      "Confirm the address and pool fee configuration.",
    );
  if (snapshot.source.status === "UNKNOWN")
    add(
      "SOURCE-UNKNOWN",
      "Verified source unavailable",
      "low",
      "security-indicator",
      ["source"],
      "Source verification could not be established. Bytecode alone does not reveal every behavior.",
      "Provide verified source and reproducible compiler settings.",
      "UNKNOWN",
      "high",
    );
  if (snapshot.proxy.kind !== "direct")
    add(
      "PROXY",
      "Implementation indirection detected",
      "medium",
      "security-indicator",
      ["proxy"],
      "The observed contract may delegate behavior to a separately deployed implementation.",
      "Inspect upgrade authority and compare implementation hashes across scans.",
      snapshot.proxy.resolved ? "OBSERVED" : "UNKNOWN",
    );
  if (snapshot.owner && !/^0x0{40}$/i.test(snapshot.owner))
    add(
      "OWNER",
      "Owner getter returned an address",
      "low",
      "security-indicator",
      ["owner"],
      "An owner() call returned a nonzero address. The getter alone does not prove which operations it controls.",
      "Review source and access control on privileged functions.",
    );
  if (snapshot.dependencies.length)
    add(
      "STATIC-CALL",
      "Static external target candidates",
      "low",
      "security-indicator",
      ["bytecode"],
      "Bytecode contains PUSH20 address constants. They are candidates, not proven call targets.",
      "Trace executed calls and inspect verified source.",
      "ESTIMATED",
      "low",
    );
  const callOps = nodes.find((n) => n.id === "bytecode")?.data.callOpcodes as
    number | undefined;
  if (callOps)
    add(
      "CALL-OPS",
      "External-call instructions present",
      "info",
      "capability",
      ["bytecode"],
      "Executable instruction scanning found CALL-family opcodes outside PUSH data. Reachability is not proven.",
      "Use traces to identify actual targets and reachable paths.",
      "ESTIMATED",
      "medium",
    );
  const result = {
    ...snapshot,
    findings,
    evidence: { nodes, edges },
    attentionScore: Math.min(
      100,
      findings.reduce((sum, f) => sum + weights[f.severity], 0),
    ),
  };
  assertEvidence(result);
  return result;
}
export function assertEvidence(
  snapshot: Pick<Snapshot, "findings" | "evidence">,
) {
  const ids = new Set<string>();
  for (const n of snapshot.evidence.nodes) {
    if (ids.has(n.id)) throw new Error("Duplicate evidence ID: " + n.id);
    ids.add(n.id);
  }
  for (const e of snapshot.evidence.edges)
    if (!ids.has(e.from) || !ids.has(e.to))
      throw new Error("Dangling evidence edge");
  for (const f of snapshot.findings) {
    if (!f.evidenceIds.length) throw new Error("Finding without evidence");
    for (const id of f.evidenceIds)
      if (!ids.has(id)) throw new Error("Unsupported finding evidence: " + id);
    if (
      !snapshot.evidence.edges.some(
        (e) => e.to === "finding:" + f.id && e.type === "SUPPORTS_FINDING",
      )
    )
      throw new Error("Finding without support edge");
  }
}
export function inspectOpcodes(code: string) {
  const bytes = Buffer.from(code.slice(2), "hex");
  let callOpcodes = 0;
  const candidates = new Set<string>();
  for (let i = 0; i < bytes.length; i++) {
    const op = bytes[i];
    if ([0xf1, 0xf2, 0xf4, 0xfa].includes(op)) callOpcodes++;
    if (op >= 0x60 && op <= 0x7f) {
      const size = op - 0x5f;
      if (op === 0x73 && i + size < bytes.length)
        candidates.add("0x" + bytes.subarray(i + 1, i + 21).toString("hex"));
      i += size;
    }
  }
  return {
    callOpcodes,
    candidates: [...candidates]
      .filter((a) => !/^0x0{40}$/.test(a))
      .sort()
      .slice(0, 40),
  };
}
export function makeNode(
  base: Pick<Snapshot, "chainId" | "blockNumber" | "blockTimestamp">,
  id: string,
  type: EvidenceNode["type"],
  label: string,
  data: Record<string, unknown>,
  status: EvidenceNode["status"] = "OBSERVED",
  method = "block-pinned JSON-RPC",
  limitations: string[] = [],
): EvidenceNode {
  return {
    id,
    type,
    label,
    status,
    source: "chain observation",
    chainId: base.chainId,
    blockNumber: base.blockNumber,
    timestamp: base.blockTimestamp,
    method,
    data,
    limitations,
  };
}
