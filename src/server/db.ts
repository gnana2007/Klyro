import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Snapshot, AIResult, PassportReport } from "../core/types";
type Job = {
  id: string;
  chainId: number;
  address: string;
  status: string;
  stage: string;
  error: string | null;
  createdAt: string;
  snapshot?: Snapshot;
};
let db: DatabaseSync;
export function database() {
  if (!db) {
    const path = process.env.DATABASE_PATH || "./data/hscan.sqlite";
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), {
        recursive: true,
      });
    db = new DatabaseSync(path);
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    db.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO migrations VALUES(1);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, chain_id INTEGER NOT NULL,address TEXT NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY REFERENCES jobs(id),chain_id INTEGER NOT NULL,address TEXT NOT NULL,block_number TEXT NOT NULL,created_at TEXT NOT NULL,body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS hook_history ON snapshots(chain_id,address,created_at);
CREATE TABLE IF NOT EXISTS ai_requests(id TEXT PRIMARY KEY,scan_id TEXT NOT NULL REFERENCES snapshots(id),created_at TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS passports(id TEXT PRIMARY KEY,scan_id TEXT NOT NULL REFERENCES snapshots(id),report_hash TEXT NOT NULL,created_at TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS executions(id TEXT PRIMARY KEY,kind TEXT NOT NULL,created_at TEXT NOT NULL,body TEXT NOT NULL);`);
  }
  return db;
}
export function createJob(job: Job) {
  database()
    .prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?)")
    .run(
      job.id,
      job.chainId,
      job.address.toLowerCase(),
      job.status,
      job.stage,
      job.error,
      job.createdAt,
    );
}
export function stageJob(
  id: string,
  status: string,
  stage: string,
  error: string | null = null,
) {
  database()
    .prepare("UPDATE jobs SET status=?,stage=?,error=? WHERE id=?")
    .run(status, stage, error, id);
}
export function saveSnapshot(s: Snapshot) {
  database()
    .prepare("INSERT INTO snapshots VALUES(?,?,?,?,?,?)")
    .run(
      s.id,
      s.chainId,
      s.address.toLowerCase(),
      s.blockNumber,
      s.scannedAt,
      JSON.stringify(s),
    );
  stageJob(s.id, "complete", "Scan complete");
}
export function getSnapshot(id: string): Snapshot | null {
  const row = database()
    .prepare("SELECT body FROM snapshots WHERE id=?")
    .get(id);
  return row ? JSON.parse(row.body as string) : null;
}
export function getJob(id: string): Job | null {
  const row = database().prepare("SELECT * FROM jobs WHERE id=?").get(id);
  return row
    ? {
        id: row.id as string,
        chainId: Number(row.chain_id),
        address: row.address as string,
        status: row.status as string,
        stage: row.stage as string,
        error: row.error as string | null,
        createdAt: row.created_at as string,
        snapshot: getSnapshot(id) ?? undefined,
      }
    : null;
}
export function history(chainId: number, address: string) {
  return database()
    .prepare(
      "SELECT body FROM snapshots WHERE chain_id=? AND address=? ORDER BY created_at DESC LIMIT 50",
    )
    .all(chainId, address.toLowerCase())
    .map((r) => JSON.parse(r.body as string) as Snapshot);
}
export function recent() {
  return database()
    .prepare("SELECT body FROM snapshots ORDER BY created_at DESC LIMIT 30")
    .all()
    .map((r) => JSON.parse(r.body as string) as Snapshot);
}
export function saveAI(r: AIResult) {
  database()
    .prepare(
      "INSERT INTO ai_requests VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    )
    .run(r.id, r.scanId, r.timestamp, JSON.stringify(r));
}
export function latestAI(id: string): AIResult | null {
  const row = database()
    .prepare(
      "SELECT body FROM ai_requests WHERE scan_id=? ORDER BY created_at DESC LIMIT 1",
    )
    .get(id);
  return row ? JSON.parse(row.body as string) : null;
}
export function savePassport(r: PassportReport, hash: string) {
  database()
    .prepare("INSERT INTO passports VALUES(?,?,?,?,?)")
    .run(r.id, r.snapshot.id, hash, r.createdAt, JSON.stringify(r));
}
export function getPassport(
  id: string,
): { report: PassportReport; reportHash: string } | null {
  const row = database().prepare("SELECT * FROM passports WHERE id=?").get(id);
  return row
    ? {
        report: JSON.parse(row.body as string),
        reportHash: row.report_hash as string,
      }
    : null;
}
export function passports() {
  return database()
    .prepare(
      "SELECT id,scan_id,report_hash,created_at FROM passports ORDER BY created_at DESC LIMIT 50",
    )
    .all();
}
export function saveExecution(id: string, kind: string, body: unknown) {
  database()
    .prepare("INSERT OR REPLACE INTO executions VALUES(?,?,?,?)")
    .run(id, kind, new Date().toISOString(), JSON.stringify(body));
}
export function executions(kind: string) {
  return database()
    .prepare(
      "SELECT body FROM executions WHERE kind=? ORDER BY created_at DESC LIMIT 30",
    )
    .all(kind)
    .map((r) => JSON.parse(r.body as string));
}
