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

export const MIGRATIONS: Migration[] = [
  { version: 1, name: "hscan-initial", sql: V1 },
  { version: 2, name: "klyro-relational-core", sql: V2 },
];
