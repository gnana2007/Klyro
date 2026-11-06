// Versioned schema migrations for Klyro.
//
// Version 1 is the original HSCAN schema. It is written here verbatim (plus the
// original `migrations` marker) so that databases created by the previous build
// remain valid and are not re-created. Later versions are additive only: no
// existing table, column or row is dropped or rewritten.
//
// The runner is idempotent and safe to call on every process start. It never
// silently "repairs" data; it records what ran in the migrations table.

export type Migration = { version: number; name: string; sql: string };

const V1 = `
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, chain_id INTEGER NOT NULL,address TEXT NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY REFERENCES jobs(id),chain_id INTEGER NOT NULL,address TEXT NOT NULL,block_number TEXT NOT NULL,created_at TEXT NOT NULL,body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS hook_history ON snapshots(chain_id,address,created_at);
CREATE TABLE IF NOT EXISTS ai_requests(id TEXT PRIMARY KEY,scan_id TEXT NOT NULL REFERENCES snapshots(id),created_at TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS passports(id TEXT PRIMARY KEY,scan_id TEXT NOT NULL REFERENCES snapshots(id),report_hash TEXT NOT NULL,created_at TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS executions(id TEXT PRIMARY KEY,kind TEXT NOT NULL,created_at TEXT NOT NULL,body TEXT NOT NULL);
`;

// v2 adds the relational investigation core. Aggregates in snapshots/passports
// remain the hashed, immutable record; these tables make the same facts
// queryable across hooks so the product can list, filter and relate instead of
// only replaying one JSON blob at a time.
//
// Design notes:
// - hooks is the stable identity: (chain_id, address). The same address on a
//   different chain is a different hook with its own row.
// - Every derived row carries the scan_id it came from, so every row can be
//   traced back to a block-pinned observation.
// - activities dedupe on (chain_id, tx_hash, log_index) exactly as the brief
//   requires, and log_index is stored as -1 for the synthetic deployment row.
// - participants are addresses with a role that always carries an evidence
//   string; a role is never asserted without saying how it was derived.
const V2 = `
CREATE TABLE IF NOT EXISTS hooks(
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_scanned_at TEXT,
  last_scan_id TEXT,
  scan_count INTEGER NOT NULL DEFAULT 0,
  deployer TEXT,
  deployment_tx_hash TEXT,
  deployment_block TEXT,
  deployment_timestamp TEXT,
  is_hook INTEGER,
  hook_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  label TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(chain_id,address)
);
CREATE INDEX IF NOT EXISTS hooks_recent ON hooks(last_scanned_at DESC);
CREATE INDEX IF NOT EXISTS hooks_deployer ON hooks(deployer);

CREATE TABLE IF NOT EXISTS activities(
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  hook_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number TEXT NOT NULL,
  block_timestamp TEXT,
  kind TEXT NOT NULL,
  event_name TEXT,
  sender TEXT,
  recipient TEXT,
  pool_id TEXT,
  token0 TEXT,
  token1 TEXT,
  amount0 TEXT,
  amount1 TEXT,
  fee TEXT,
  data TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  scan_id TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS activities_identity ON activities(chain_id,tx_hash,log_index);
CREATE INDEX IF NOT EXISTS activities_hook ON activities(chain_id,hook_address,block_number DESC);
CREATE INDEX IF NOT EXISTS activities_kind ON activities(chain_id,hook_address,kind,block_number DESC);
CREATE INDEX IF NOT EXISTS activities_sender ON activities(sender);

CREATE TABLE IF NOT EXISTS participants(
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  hook_address TEXT NOT NULL,
  address TEXT NOT NULL,
  role TEXT NOT NULL,
  evidence TEXT NOT NULL,
  status TEXT NOT NULL,
  first_seen_at TEXT,
  last_seen_at TEXT,
  activity_count INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS participants_identity ON participants(chain_id,hook_address,address,role);
CREATE INDEX IF NOT EXISTS participants_hook ON participants(chain_id,hook_address,role);

CREATE TABLE IF NOT EXISTS graph_nodes(
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  hook_address TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS graph_nodes_scan ON graph_nodes(scan_id);

CREATE TABLE IF NOT EXISTS graph_edges(
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  hook_address TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS graph_edges_scan ON graph_edges(scan_id);
CREATE INDEX IF NOT EXISTS graph_edges_source ON graph_edges(scan_id,source_id);
CREATE INDEX IF NOT EXISTS graph_edges_target ON graph_edges(scan_id,target_id);

CREATE TABLE IF NOT EXISTS scan_index_state(
  chain_id INTEGER NOT NULL,
  hook_address TEXT NOT NULL,
  last_indexed_block TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(chain_id,hook_address)
);
`;

// v3 adds scheduled monitoring. Additive only: no existing table or column is
// touched.
//
// Why a lock table instead of relying on the in-process scheduler:
// - A restart, a second replica, or a redeploy can each try to run the same
//   hook at the same time. The unique key on (chain_id, address) means one
//   process wins and the others skip, so a hook is never scanned twice at once.
// - The lease expires (`locked_until`), so a process that dies mid-scan cannot
//   block a hook forever. A stale lock is reclaimable; a live one is respected.
// - Every attempt is appended to `monitor_runs`, including failures, so the
//   history of automatic activity is inspectable and never implied.
const V3 = `
CREATE TABLE IF NOT EXISTS monitors(
  chain_id INTEGER NOT NULL,
  hook_address TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  last_run_at TEXT,
  last_run_status TEXT,
  last_run_block TEXT,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(chain_id,hook_address)
);
CREATE INDEX IF NOT EXISTS monitors_due ON monitors(enabled,next_run_at);

CREATE TABLE IF NOT EXISTS monitor_locks(
  chain_id INTEGER NOT NULL,
  hook_address TEXT NOT NULL,
  holder TEXT NOT NULL,
  locked_until TEXT NOT NULL,
  PRIMARY KEY(chain_id,hook_address)
);

CREATE TABLE IF NOT EXISTS monitor_runs(
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  hook_address TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  scan_id TEXT,
  block_number TEXT,
  stage TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS monitor_runs_hook ON monitor_runs(chain_id,hook_address,started_at DESC);
`;

// v4 adds the scheduler heartbeat.
//
// This exists because the scheduler runs in the instrumentation module while
// API routes may be a separate bundle instance, so an in-memory "is the timer
// running" flag cannot be trusted across them. The heartbeat is written to
// SQLite each tick, so any instance can answer from durable state.
//
// It is deliberately a NEW version rather than an edit to v3: a database that
// already recorded v3 would never re-run it, so an edit would silently never
// apply in production (exactly the failure that exposed this bug here).
const V4 = `
CREATE TABLE IF NOT EXISTS scheduler_heartbeat(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// v5 records wallet-signed contract deployments and report publications.
//
// A row is written before the transaction is sent and updated only from an
// actual receipt, so an interrupted send leaves a visible `unconfirmed` record
// instead of a silent gap. `address` stays NULL until the chain names one.
const V5 = `
CREATE TABLE IF NOT EXISTS deployments(
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  address TEXT,
  tx_hash TEXT NOT NULL,
  owner TEXT NOT NULL,
  deployer TEXT NOT NULL,
  status TEXT NOT NULL,
  block_number TEXT,
  gas_used TEXT,
  code_size INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deployments_chain ON deployments(chain_id,created_at DESC);

CREATE TABLE IF NOT EXISTS publications(
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  registry TEXT NOT NULL,
  hook TEXT NOT NULL,
  report_hash TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  risk_level INTEGER NOT NULL,
  passport_id TEXT,
  tx_hash TEXT NOT NULL,
  publisher TEXT NOT NULL,
  status TEXT NOT NULL,
  block_number TEXT,
  gas_used TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publications_hook ON publications(chain_id,hook,created_at DESC);
`;

export const MIGRATIONS: Migration[] = [
  { version: 1, name: "hscan-initial", sql: V1 },
  { version: 2, name: "klyro-relational-core", sql: V2 },
  { version: 3, name: "klyro-monitoring", sql: V3 },
  { version: 4, name: "klyro-scheduler-heartbeat", sql: V4 },
  { version: 5, name: "klyro-deployments-and-publications", sql: V5 },
];
