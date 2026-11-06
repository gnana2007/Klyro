import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Snapshot, AIResult, PassportReport } from "../core/types";
import { MIGRATIONS } from "./schema";
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
    migrate(db);
    db.exec(
      "UPDATE jobs SET status='failed',stage='Interrupted',error='Server restarted during scan; retry this live observation.' WHERE status IN ('queued','running')",
    );
  }
  return db;
}
// Applies every migration newer than the recorded maximum version. The marker
// table already exists in databases produced by the previous build, so those
// keep version 1 and only receive additive versions afterwards.
export function migrate(handle: DatabaseSync) {
  handle.exec("CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)");
  const columns = handle.prepare("PRAGMA table_info(migrations)").all() as {
    name: string;
  }[];
  // Databases from the previous build have only a `version` column.
  if (!columns.some((c) => c.name === "name"))
    handle.exec("ALTER TABLE migrations ADD COLUMN name TEXT");
  if (!columns.some((c) => c.name === "applied_at"))
    handle.exec("ALTER TABLE migrations ADD COLUMN applied_at TEXT");

  const row = handle
    .prepare("SELECT MAX(version) AS v FROM migrations")
    .get() as { v: number | null } | undefined;
  const applied = row?.v ?? 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= applied) continue;
    handle.exec("BEGIN");
    try {
      handle.exec(migration.sql);
      handle
        .prepare(
          "INSERT OR REPLACE INTO migrations(version,name,applied_at) VALUES(?,?,?)",
        )
        .run(
          migration.version,
          migration.name,
          new Date().toISOString(),
        );
      handle.exec("COMMIT");
    } catch (error) {
      handle.exec("ROLLBACK");
      throw error;
    }
  }
}
export function schemaVersion() {
  const row = database()
    .prepare("SELECT MAX(version) AS v FROM migrations")
    .get() as { v: number | null } | undefined;
  return row?.v ?? 0;
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
/**
 * Persist a snapshot.
 *
 * `snapshots.id` has a foreign key to `jobs`, which existed because every scan
 * used to be started from the UI. Scheduled scans have no job row, and the
 * constraint rejected them with "FOREIGN KEY constraint failed" — a real bug
 * that only appeared once monitoring existed.
 *
 * The durable record of a scan is the snapshot itself, so this function now
 * ensures a job row exists for it rather than requiring the caller to create
 * one first. A scan started from the UI keeps its real job row and stage; a
 * scheduled scan gets a completed job row marked with its trigger. Both paths
 * therefore produce identical, queryable history.
 */
export function saveSnapshot(s: Snapshot, trigger = "manual") {
  const existing = database()
    .prepare("SELECT id FROM jobs WHERE id=?")
    .get(s.id) as { id: string } | undefined;
  if (!existing)
    createJob({
      id: s.id,
      chainId: s.chainId,
      address: s.address,
      status: "complete",
      stage: trigger === "schedule" ? "Scheduled scan complete" : "Scan complete",
      error: null,
      createdAt: s.scannedAt,
    });
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
