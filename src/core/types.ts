export type ObservationStatus =
  "OBSERVED" | "SIMULATED" | "ESTIMATED" | "UNKNOWN";
export type Severity = "info" | "low" | "medium" | "high";
export type EvidenceNode = {
  id: string;
  type:
    | "Hook"
    | "Contract"
    | "Permission"
    | "Callback"
    | "Code observation"
    | "External dependency"
    | "Admin mechanism"
    | "Simulation scenario"
    | "Simulation result"
    | "Balance change"
    | "Risk finding"
    | "AI explanation"
    | "Report"
    | "Historical change";
  label: string;
  status: ObservationStatus;
  source: string;
  chainId: number;
  blockNumber: string;
  timestamp: string;
  method: string;
  data: Record<string, unknown>;
  limitations: string[];
};
export type EvidenceEdge = {
  from: string;
  to: string;
  type:
    | "HAS_PERMISSION"
    | "ENABLES_CALLBACK"
    | "IMPLEMENTS_CALLBACK"
    | "CALLS_EXTERNAL"
    | "CONTROLLED_BY"
    | "TESTED_BY"
    | "PRODUCED_RESULT"
    | "SUPPORTS_FINDING"
    | "CONTRADICTS_FINDING"
    | "EXPLAINED_BY"
    | "CHANGED_FROM"
    | "INCLUDED_IN_REPORT";
};
export type Finding = {
  chainId: number;
  blockNumber: string;
  timestamp: string;
  sourceType: "deterministic-analysis";
  detectionMethod: string;
  id: string;
  ruleId: string;
  category: "capability" | "security-indicator" | "observed-behavior";
  severity: Severity;
  confidence: "high" | "medium" | "low";
  status: ObservationStatus;
  title: string;
  explanation: string;
  evidenceIds: string[];
  investigation: string;
  limitations: string[];
  analysisVersion: string;
};
export type Permission = {
  name: string;
  bit: number;
  enabled: boolean;
  description: string;
};
export type Proxy = {
  kind: "direct" | "eip1967" | "beacon" | "minimal" | "unknown";
  implementation: string | null;
  implementationHash: string | null;
  admin: string | null;
  beacon: string | null;
  resolved: boolean;
  limitations: string[];
};
/** Deployment discovery result. UNKNOWN is a real state, not a zero value. */
export type DeploymentFacts = {
  status: "OBSERVED" | "UNKNOWN";
  txHash: string | null;
  blockNumber: string | null;
  timestamp: string | null;
  deployer: string | null;
  method: string;
};
/** A participant role derived only from an observed log or storage read. */
export type ParticipantFact = {
  address: string;
  role: string;
  evidence: string;
  status: "OBSERVED" | "INFERRED" | "UNKNOWN";
  activityCount?: number;
};
/** Bounded PoolManager activity summary for this hook in the scanned window. */
export type ActivitySummary = {
  status: "OBSERVED" | "PARTIAL" | "UNKNOWN";
  fromBlock: string;
  toBlock: string;
  counts: Record<string, number>;
  total: number;
  lastIndexedBlock: string | null;
  reason: string | null;
};
export type Snapshot = {
  schema: "hscan.snapshot.v2";
  id: string;
  chainId: number;
  address: string;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: string;
  scannedAt: string;
  runtimeHash: string;
  codeSize: number;
  permissions: Permission[];
  permissionBitmap: number;
  permissionValid: boolean;
  compatibility: "UNKNOWN" | "INVALID" | "POOL_OBSERVED";
  proxy: Proxy;
  owner: string | null;
  source: {
    status: "VERIFIED" | "UNKNOWN";
    url: string | null;
    files: { name: string; content: string }[];
  };
  dependencies: string[];
  poolContext: {
    manager: string | null;
    pools: Record<string, unknown>[];
    status: ObservationStatus;
  };
  /** Registry-observed hook status. Never implied from permissions alone. */
  hookStatus: "POOL_OBSERVED" | "NOT_A_HOOK" | "ADDRESS_ONLY" | "UNKNOWN";
  deployment: DeploymentFacts | null;
  participants: ParticipantFact[];
  activity: ActivitySummary | null;
  findings: Finding[];
  evidence: { nodes: EvidenceNode[]; edges: EvidenceEdge[] };
  attentionScore: number;
  stateFingerprint: string;
  observationFingerprint: string;
  analysisVersion: string;
  limitations: string[];
};
export type Diff = {
  schema: "hscan.diff.v1";
  id: string;
  previousId: string;
  currentId: string;
  changes: {
    field: string;
    before: unknown;
    after: unknown;
    status: "changed" | "unchanged" | "inconclusive";
    evidenceIds: string[];
  }[];
  findings: {
    id: string;
    status:
      | "new"
      | "unchanged"
      | "resolved"
      | "worsened"
      | "changed"
      | "requires-reassessment";
    before?: Finding;
    after?: Finding;
  }[];
  limitations: string[];
};
export type AIResult = {
  id: string;
  scanId: string;
  provider: "0G";
  model: string;
  status: "pending" | "complete" | "failed" | "unavailable";
  requestId: string | null;
  timestamp: string;
  inputHash: string;
  outputHash: string | null;
  routerTeeVerified: boolean | null;
  independentVerification: "NOT_PERFORMED";
  trustMode: string;
  verificationEvidence: Record<string, unknown> | null;
  output: unknown;
  error: string | null;
};
export type PassportReport = {
  schema: "hscan.passport.v1";
  id: string;
  createdAt: string;
  snapshot: Snapshot;
  diff: Diff | null;
  inference: AIResult | null;
  simulation: unknown | null;
  limitations: string[];
};
