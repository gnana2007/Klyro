import { decodePermissions } from "../src/core/permissions";
import { fingerprints, ANALYSIS_VERSION } from "../src/core/canonical";
import { makeNode } from "../src/core/analysis";
import type { Snapshot } from "../src/core/types";
export function snapshot(): Snapshot {
  const s: Snapshot = {
    schema: "hscan.snapshot.v1",
    id: "00000000-0000-4000-8000-000000000001",
    chainId: 31337,
    address: "0x00000000000000000000000000000000000000c4",
    blockNumber: "1",
    blockHash: "0x" + "11".repeat(32),
    blockTimestamp: "2026-11-06T00:00:00.000Z",
    scannedAt: "2026-11-06T00:00:00.000Z",
    runtimeHash: "0x" + "22".repeat(32),
    codeSize: 10,
    permissions: decodePermissions("0xc4"),
    permissionBitmap: 196,
    permissionValid: true,
    compatibility: "UNKNOWN",
    proxy: {
      kind: "direct",
      implementation: null,
      implementationHash: null,
      admin: null,
      beacon: null,
      resolved: true,
      limitations: [],
    },
    owner: null,
    source: { status: "UNKNOWN", url: null, files: [] },
    dependencies: [],
    poolContext: { manager: null, pools: [], status: "UNKNOWN" },
    findings: [],
    evidence: { nodes: [], edges: [] },
    attentionScore: 0,
    stateFingerprint: "",
    observationFingerprint: "",
    analysisVersion: ANALYSIS_VERSION,
    limitations: [],
  };
  s.evidence.nodes = [
    makeNode(s, "hook", "Hook", "Test fixture", {}),
    makeNode(s, "permissions", "Code observation", "Flags", {}),
    makeNode(s, "source", "Code observation", "Source", {}, "UNKNOWN"),
    makeNode(s, "proxy", "Code observation", "Proxy", {}),
    makeNode(s, "bytecode", "Contract", "Bytecode", {}),
    ...s.permissions.map((p) =>
      makeNode(s, "permission:" + p.name, "Permission", p.name, {
        enabled: p.enabled,
      }),
    ),
  ];
  Object.assign(s, fingerprints(s));
  return s;
}
