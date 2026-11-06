import { randomBytes } from "node:crypto";
import { database } from "./db";

// Typed access to the relational investigation core (schema v2).
//
// Provenance rules enforced here rather than in callers:
// - every activity carries a `source` and a `status`, so an emitted event is
//   never silently presented as a reconstructed or inferred one;
// - activity identity is (chain_id, tx_hash, log_index) and inserts are
//   idempotent, so re-indexing a range cannot duplicate history;
// - participants always store the evidence string that justifies the role.

export type HookStatus =
  | "UNKNOWN"
  | "NOT_A_HOOK"
  | "ADDRESS_ONLY"
  | "POOL_OBSERVED";

export type HookRecord = {
  chainId: number;
  address: string;
  firstSeenAt: string;
  lastScannedAt: string | null;
  lastScanId: string | null;
  scanCount: number;
  deployer: string | null;
  deploymentTxHash: string | null;
  deploymentBlock: string | null;
  deploymentTimestamp: string | null;
  isHook: boolean | null;
  hookStatus: HookStatus;
  label: string | null;
  archived: boolean;
};

type HookRow = {
  chain_id: number;
  address: string;
  first_seen_at: string;
  last_scanned_at: string | null;
  last_scan_id: string | null;
  scan_count: number;
  deployer: string | null;
  deployment_tx_hash: string | null;
  deployment_block: string | null;
  deployment_timestamp: string | null;
  is_hook: number | null;
  hook_status: string;
  label: string | null;
  archived: number;
};

const hookFrom = (r: HookRow): HookRecord => ({
  chainId: r.chain_id,
  address: r.address,
  firstSeenAt: r.first_seen_at,
  lastScannedAt: r.last_scanned_at,
  lastScanId: r.last_scan_id,
  scanCount: r.scan_count,
  deployer: r.deployer,
  deploymentTxHash: r.deployment_tx_hash,
  deploymentBlock: r.deployment_block,
  deploymentTimestamp: r.deployment_timestamp,
  isHook: r.is_hook === null ? null : r.is_hook === 1,
  hookStatus: r.hook_status as HookStatus,
  label: r.label,
  archived: r.archived === 1,
});

export type HookUpsert = {
  chainId: number;
  address: string;
  status?: HookStatus;
  isHook?: boolean | null;
  deployer?: string | null;
  deploymentTxHash?: string | null;
  deploymentBlock?: string | null;
  deploymentTimestamp?: string | null;
  scanId?: string | null;
  label?: string | null;
};

/**
 * Register a hook or refresh its summary. Never overwrites historical scan
 * bodies; it only maintains the derived overview row.
 */
export function upsertHook(input: HookUpsert): HookRecord {
  const now = new Date().toISOString();
  const address = input.address.toLowerCase();
  const existing = getHook(input.chainId, address);
  if (!existing) {
    database()
      .prepare(
        `INSERT INTO hooks(chain_id,address,first_seen_at,last_scanned_at,last_scan_id,scan_count,deployer,deployment_tx_hash,deployment_block,deployment_timestamp,is_hook,hook_status,label,archived)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      )
      .run(
        input.chainId,
        address,
        now,
        input.scanId ? now : null,
        input.scanId ?? null,
        input.scanId ? 1 : 0,
        input.deployer?.toLowerCase() ?? null,
        input.deploymentTxHash ?? null,
        input.deploymentBlock ?? null,
        input.deploymentTimestamp ?? null,
        input.isHook === undefined || input.isHook === null
          ? null
          : input.isHook
            ? 1
            : 0,
        input.status ?? "UNKNOWN",
        input.label ?? null,
      );
    return getHook(input.chainId, address)!;
  }
  database()
    .prepare(
      `UPDATE hooks SET
         last_scanned_at = COALESCE(?, last_scanned_at),
         last_scan_id = COALESCE(?, last_scan_id),
         scan_count = scan_count + ?,
         deployer = COALESCE(?, deployer),
         deployment_tx_hash = COALESCE(?, deployment_tx_hash),
         deployment_block = COALESCE(?, deployment_block),
         deployment_timestamp = COALESCE(?, deployment_timestamp),
         is_hook = COALESCE(?, is_hook),
         hook_status = ?,
         label = COALESCE(?, label)
       WHERE chain_id=? AND address=?`,
    )
    .run(
      input.scanId ? now : null,
      input.scanId ?? null,
      input.scanId ? 1 : 0,
      input.deployer?.toLowerCase() ?? null,
      input.deploymentTxHash ?? null,
      input.deploymentBlock ?? null,
      input.deploymentTimestamp ?? null,
      input.isHook === undefined || input.isHook === null
        ? null
        : input.isHook
          ? 1
          : 0,
      input.status ?? existing.hookStatus,
      input.label ?? null,
      input.chainId,
      address,
    );
  return getHook(input.chainId, address)!;
}

export function getHook(chainId: number, address: string) {
  const row = database()
    .prepare("SELECT * FROM hooks WHERE chain_id=? AND address=?")
    .get(chainId, address.toLowerCase()) as HookRow | undefined;
  return row ? hookFrom(row) : null;
}

export function setArchived(chainId: number, address: string, archived: boolean) {
  database()
    .prepare("UPDATE hooks SET archived=? WHERE chain_id=? AND address=?")
    .run(archived ? 1 : 0, chainId, address.toLowerCase());
  return getHook(chainId, address);
}

export type HookQuery = {
  chainId?: number;
  archived?: boolean;
  status?: HookStatus;
  deployer?: string;
  limit?: number;
  offset?: number;
};

export function listHooks(query: HookQuery = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (query.chainId !== undefined) {
    where.push("chain_id=?");
    params.push(query.chainId);
  }
  if (query.archived !== undefined) {
    where.push("archived=?");
    params.push(query.archived ? 1 : 0);
  }
  if (query.status) {
    where.push("hook_status=?");
    params.push(query.status);
  }
  if (query.deployer) {
    where.push("deployer=?");
    params.push(query.deployer.toLowerCase());
  }
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";
  const rows = database()
    .prepare(
      `SELECT * FROM hooks ${clause} ORDER BY COALESCE(last_scanned_at, first_seen_at) DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as HookRow[];
  const total = (
    database()
      .prepare(`SELECT COUNT(*) AS c FROM hooks ${clause}`)
      .get(...params) as { c: number }
  ).c;
  return { hooks: rows.map(hookFrom), total, limit, offset };
}

export function countHooks() {
  return (
    database()
      .prepare("SELECT COUNT(*) AS c FROM hooks WHERE archived=0")
      .get() as { c: number }
  ).c;
}

// ---------------------------------------------------------------------------
// Activities

export type ActivityKind =
  | "deployment"
  | "pool-initialized"
  | "liquidity-added"
  | "liquidity-removed"
  | "swap"
  | "donation"
  | "transfer";

export type ActivityStatus = "OBSERVED" | "RECONSTRUCTED" | "INFERRED";

export type ActivityInput = {
  chainId: number;
  hookAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  blockTimestamp: string | null;
  kind: ActivityKind;
  eventName: string | null;
  sender: string | null;
  recipient: string | null;
  poolId: string | null;
  token0: string | null;
  token1: string | null;
  amount0: string | null;
  amount1: string | null;
  fee: string | null;
  data: Record<string, unknown>;
  source: string;
  status: ActivityStatus;
  scanId: string | null;
};

export type ActivityRecord = ActivityInput & { id: string; createdAt: string };

const activityFrom = (r: Record<string, unknown>): ActivityRecord => ({
  id: r.id as string,
  chainId: Number(r.chain_id),
  hookAddress: r.hook_address as string,
  txHash: r.tx_hash as string,
  logIndex: Number(r.log_index),
  blockNumber: r.block_number as string,
  blockTimestamp: (r.block_timestamp as string) ?? null,
  kind: r.kind as ActivityKind,
  eventName: (r.event_name as string) ?? null,
  sender: (r.sender as string) ?? null,
  recipient: (r.recipient as string) ?? null,
  poolId: (r.pool_id as string) ?? null,
  token0: (r.token0 as string) ?? null,
  token1: (r.token1 as string) ?? null,
  amount0: (r.amount0 as string) ?? null,
  amount1: (r.amount1 as string) ?? null,
  fee: (r.fee as string) ?? null,
  data: JSON.parse((r.data as string) || "{}") as Record<string, unknown>,
  source: r.source as string,
  status: r.status as ActivityStatus,
  scanId: (r.scan_id as string) ?? null,
  createdAt: r.created_at as string,
});

/** Insert activities, ignoring ones already recorded. Returns how many were new. */
export function recordActivities(items: ActivityInput[]): number {
  if (!items.length) return 0;
  const columns = [
    "id", "chain_id", "hook_address", "tx_hash", "log_index", "block_number",
    "block_timestamp", "kind", "event_name", "sender", "recipient", "pool_id",
    "token0", "token1", "amount0", "amount1", "fee", "data", "source",
    "status", "scan_id", "created_at",
  ];
  // Placeholder count is derived from the column list so a value can never be
  // silently dropped: node:sqlite binds a missing parameter as NULL, and
  // INSERT OR IGNORE would then hide the NOT NULL violation entirely.
  const insert = database().prepare(
    `INSERT OR IGNORE INTO activities(${columns.join(",")})
     VALUES(${columns.map(() => "?").join(",")})`,
  );
  let inserted = 0;
  for (const a of items) {
    const result = insert.run(
      randomBytes(16).toString("hex"),
      a.chainId,
      a.hookAddress.toLowerCase(),
      a.txHash.toLowerCase(),
      a.logIndex,
      a.blockNumber,
      a.blockTimestamp,
      a.kind,
      a.eventName,
      a.sender?.toLowerCase() ?? null,
      a.recipient?.toLowerCase() ?? null,
      a.poolId,
      a.token0?.toLowerCase() ?? null,
      a.token1?.toLowerCase() ?? null,
      a.amount0,
      a.amount1,
      a.fee,
      JSON.stringify(a.data),
      a.source,
      a.status,
      a.scanId,
      new Date().toISOString(),
    );
    if (Number(result.changes) > 0) inserted += 1;
  }
  return inserted;
}

export type ActivityQuery = {
  chainId: number;
  hookAddress: string;
  kind?: ActivityKind;
  address?: string;
  fromBlock?: string;
  toBlock?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
};

export function listActivities(query: ActivityQuery) {
  const where: string[] = ["chain_id=?", "hook_address=?"];
  const params: (string | number)[] = [
    query.chainId,
    query.hookAddress.toLowerCase(),
  ];
  if (query.kind) {
    where.push("kind=?");
    params.push(query.kind);
  }
  if (query.address) {
    where.push("(sender=? OR recipient=?)");
    const a = query.address.toLowerCase();
    params.push(a, a);
  }
  if (query.fromBlock) {
    where.push("CAST(block_number AS INTEGER) >= CAST(? AS INTEGER)");
    params.push(query.fromBlock);
  }
  if (query.toBlock) {
    where.push("CAST(block_number AS INTEGER) <= CAST(? AS INTEGER)");
    params.push(query.toBlock);
  }
  if (query.fromTimestamp) {
    where.push("block_timestamp >= ?");
    params.push(query.fromTimestamp);
  }
  if (query.toTimestamp) {
    where.push("block_timestamp <= ?");
    params.push(query.toTimestamp);
  }
  const clause = where.join(" AND ");
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);
  const rows = database()
    .prepare(
      `SELECT * FROM activities WHERE ${clause} ORDER BY CAST(block_number AS INTEGER) DESC, log_index DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Record<string, unknown>[];
  const total = (
    database()
      .prepare(`SELECT COUNT(*) AS c FROM activities WHERE ${clause}`)
      .get(...params) as { c: number }
  ).c;
  return { activities: rows.map(activityFrom), total, limit, offset };
}

export function activityKindCounts(chainId: number, hookAddress: string) {
  const rows = database()
    .prepare(
      "SELECT kind, COUNT(*) AS c FROM activities WHERE chain_id=? AND hook_address=? GROUP BY kind",
    )
    .all(chainId, hookAddress.toLowerCase()) as { kind: string; c: number }[];
  return Object.fromEntries(rows.map((r) => [r.kind, r.c])) as Record<
    string,
    number
  >;
}

export function lastIndexedBlock(chainId: number, hookAddress: string) {
  const row = database()
    .prepare(
      "SELECT last_indexed_block FROM scan_index_state WHERE chain_id=? AND hook_address=?",
    )
    .get(chainId, hookAddress.toLowerCase()) as
    | { last_indexed_block: string }
    | undefined;
  return row?.last_indexed_block ?? null;
}

export function setLastIndexedBlock(
  chainId: number,
  hookAddress: string,
  block: string,
) {
  database()
    .prepare(
      `INSERT INTO scan_index_state(chain_id,hook_address,last_indexed_block,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(chain_id,hook_address) DO UPDATE SET last_indexed_block=excluded.last_indexed_block, updated_at=excluded.updated_at`,
    )
    .run(chainId, hookAddress.toLowerCase(), block, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Participants

export type ParticipantRole =
  | "deployer" | "owner" | "administrator" | "proxy-admin"
  | "pool-creator" | "liquidity-provider" | "swapper" | "recipient"
  | "dependency" | "publisher";

export type ParticipantStatus = "OBSERVED" | "INFERRED" | "UNKNOWN";

export type ParticipantInput = {
  chainId: number;
  hookAddress: string;
  address: string;
  role: ParticipantRole;
  evidence: string;
  status: ParticipantStatus;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  activityCount?: number;
  data?: Record<string, unknown>;
};

/**
 * Record a participant role. A role always carries the evidence that justifies
 * it; callers cannot register a role without saying where it came from.
 */
export function upsertParticipant(p: ParticipantInput) {
  const now = new Date().toISOString();
  database()
    .prepare(
      `INSERT INTO participants(id,chain_id,hook_address,address,role,evidence,status,first_seen_at,last_seen_at,activity_count,data,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(chain_id,hook_address,address,role) DO UPDATE SET
         evidence=excluded.evidence,
         status=excluded.status,
         first_seen_at=COALESCE(participants.first_seen_at, excluded.first_seen_at),
         last_seen_at=excluded.last_seen_at,
         activity_count=excluded.activity_count,
         data=excluded.data,
         updated_at=excluded.updated_at`,
    )
    .run(
      randomBytes(16).toString("hex"),
      p.chainId,
      p.hookAddress.toLowerCase(),
      p.address.toLowerCase(),
      p.role,
      p.evidence,
      p.status,
      p.firstSeenAt ?? null,
      p.lastSeenAt ?? null,
      p.activityCount ?? 0,
      JSON.stringify(p.data ?? {}),
      now,
    );
}

export function listParticipants(
  chainId: number,
  hookAddress: string,
  role?: ParticipantRole,
) {
  const rows = database()
    .prepare(
      role
        ? "SELECT * FROM participants WHERE chain_id=? AND hook_address=? AND role=? ORDER BY activity_count DESC, updated_at DESC"
        : "SELECT * FROM participants WHERE chain_id=? AND hook_address=? ORDER BY role, activity_count DESC",
    )
    .all(
      ...(role
        ? [chainId, hookAddress.toLowerCase(), role]
        : [chainId, hookAddress.toLowerCase()]),
    ) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    chainId: Number(r.chain_id),
    hookAddress: r.hook_address as string,
    address: r.address as string,
    role: r.role as ParticipantRole,
    evidence: r.evidence as string,
    status: r.status as ParticipantStatus,
    firstSeenAt: (r.first_seen_at as string) ?? null,
    lastSeenAt: (r.last_seen_at as string) ?? null,
    activityCount: Number(r.activity_count),
    data: JSON.parse((r.data as string) || "{}") as Record<string, unknown>,
    updatedAt: r.updated_at as string,
  }));
}

// ---------------------------------------------------------------------------
// Graph persistence (mirrors the in-snapshot evidence graph for cross-scan queries)

export function saveGraph(
  scanId: string,
  chainId: number,
  hookAddress: string,
  nodes: { id: string; type: string; label: string; status: string; data: unknown }[],
  edges: {
    from: string;
    to: string;
    type: string;
    status: string;
    evidence: string;
  }[],
) {
  const db = database();
  db.prepare("DELETE FROM graph_nodes WHERE scan_id=?").run(scanId);
  db.prepare("DELETE FROM graph_edges WHERE scan_id=?").run(scanId);
  const insertNode = db.prepare(
    "INSERT OR REPLACE INTO graph_nodes(id,scan_id,chain_id,hook_address,type,label,status,data) VALUES(?,?,?,?,?,?,?,?)",
  );
  const insertEdge = db.prepare(
    "INSERT OR REPLACE INTO graph_edges(id,scan_id,chain_id,hook_address,source_id,target_id,type,status,evidence) VALUES(?,?,?,?,?,?,?,?,?)",
  );
  db.exec("BEGIN");
  try {
    for (const n of nodes)
      insertNode.run(
        `${scanId}:${n.id}`,
        scanId,
        chainId,
        hookAddress.toLowerCase(),
        n.type,
        n.label,
        n.status,
        JSON.stringify(n.data ?? null),
      );
    for (const e of edges)
      insertEdge.run(
        `${scanId}:${e.from}:${e.type}:${e.to}`,
        scanId,
        chainId,
        hookAddress.toLowerCase(),
        e.from,
        e.to,
        e.type,
        e.status,
        e.evidence,
      );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listGraph(scanId: string) {
  const nodes = database()
    .prepare("SELECT * FROM graph_nodes WHERE scan_id=?")
    .all(scanId) as Record<string, unknown>[];
  const edges = database()
    .prepare("SELECT * FROM graph_edges WHERE scan_id=?")
    .all(scanId) as Record<string, unknown>[];
  return {
    nodes: nodes.map((n) => ({
      id: n.id as string,
      type: n.type as string,
      label: n.label as string,
      status: n.status as string,
      data: JSON.parse((n.data as string) || "null"),
    })),
    edges: edges.map((e) => ({
      from: e.source_id as string,
      to: e.target_id as string,
      type: e.type as string,
      status: e.status as string,
      evidence: e.evidence as string,
    })),
  };
}
