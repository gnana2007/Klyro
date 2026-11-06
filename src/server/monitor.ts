import { randomBytes } from "node:crypto";
import { database } from "./db";
import * as db from "./db";
import * as repo from "./repository";

// Scheduled hook monitoring.
//
// Design constraints, in order of importance:
// 1. Never scan the same hook twice at the same time. Enforced by a row-level
//    lease in `monitor_locks`, not by an in-process flag, so it holds across a
//    restart or a second replica.
// 2. Never hide a failure. Each attempt is written to `monitor_runs` before and
//    after it runs, and the monitor row keeps the last error and a consecutive
//    failure count. Backoff grows with repeated failure so a broken RPC is not
//    hammered on an interval.
// 3. Never claim a scan happened. A run is recorded as `started` and only
//    becomes `complete` when the scan actually returned a snapshot.
//
// The scheduler is a single setInterval inside the Node process. That is the
// right scope here: the app is documented as one persistent Node process, and
// the lock makes a second instance safe rather than duplicating work.

export type MonitorRow = {
  chainId: number;
  hookAddress: string;
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunBlock: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  nextRunAt: string | null;
  createdAt: string;
};

const fromRow = (r: Record<string, unknown>): MonitorRow => ({
  chainId: Number(r.chain_id),
  hookAddress: r.hook_address as string,
  enabled: Number(r.enabled) === 1,
  intervalMinutes: Number(r.interval_minutes),
  lastRunAt: (r.last_run_at as string) ?? null,
  lastRunStatus: (r.last_run_status as string) ?? null,
  lastRunBlock: (r.last_run_block as string) ?? null,
  lastError: (r.last_error as string) ?? null,
  consecutiveFailures: Number(r.consecutive_failures),
  nextRunAt: (r.next_run_at as string) ?? null,
  createdAt: r.created_at as string,
});

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 60 * 24 * 7;

export function addMonitor(params: {
  chainId: number;
  hookAddress: string;
  intervalMinutes?: number;
}) {
  const interval = clampInterval(params.intervalMinutes ?? 60);
  const address = params.hookAddress.toLowerCase();
  const now = new Date();
  database()
    .prepare(
      `INSERT INTO monitors(chain_id,hook_address,enabled,interval_minutes,next_run_at,created_at)
       VALUES(?,?,1,?,?,?)
       ON CONFLICT(chain_id,hook_address) DO UPDATE SET
         enabled=1,
         interval_minutes=excluded.interval_minutes,
         next_run_at=excluded.next_run_at`,
    )
    .run(
      params.chainId,
      address,
      interval,
      now.toISOString(),
      now.toISOString(),
    );
  return getMonitor(params.chainId, address);
}

export function removeMonitor(chainId: number, hookAddress: string) {
  const result = database()
    .prepare("DELETE FROM monitors WHERE chain_id=? AND hook_address=?")
    .run(chainId, hookAddress.toLowerCase());
  return Number(result.changes) > 0;
}

export function setEnabled(
  chainId: number,
  hookAddress: string,
  enabled: boolean,
) {
  database()
    .prepare(
      "UPDATE monitors SET enabled=?, next_run_at=? WHERE chain_id=? AND hook_address=?",
    )
    .run(
      enabled ? 1 : 0,
      new Date().toISOString(),
      chainId,
      hookAddress.toLowerCase(),
    );
  return getMonitor(chainId, hookAddress);
}

export function getMonitor(
  chainId: number,
  hookAddress: string,
): MonitorRow | null {
  const row = database()
    .prepare("SELECT * FROM monitors WHERE chain_id=? AND hook_address=?")
    .get(chainId, hookAddress.toLowerCase()) as
    | Record<string, unknown>
    | undefined;
  return row ? fromRow(row) : null;
}

export function listMonitors(): MonitorRow[] {
  const rows = database()
    .prepare("SELECT * FROM monitors ORDER BY next_run_at ASC")
    .all() as Record<string, unknown>[];
  return rows.map(fromRow);
}

export function listRuns(limit = 50) {
  const rows = database()
    .prepare(
      "SELECT * FROM monitor_runs ORDER BY started_at DESC LIMIT ?",
    )
    .all(Math.min(Math.max(limit, 1), 200)) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    chainId: Number(r.chain_id),
    hookAddress: r.hook_address as string,
    trigger: r.trigger as string,
    status: r.status as string,
    scanId: (r.scan_id as string) ?? null,
    blockNumber: (r.block_number as string) ?? null,
    stage: (r.stage as string) ?? null,
    error: (r.error as string) ?? null,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string) ?? null,
  }));
}

function clampInterval(minutes: number) {
  if (!Number.isFinite(minutes)) return 60;
  return Math.min(
    MAX_INTERVAL_MINUTES,
    Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)),
  );
}

/** Backoff: 1x, 2x, 4x, capped at 8x the interval after repeated failures. */
function backoffMinutes(interval: number, failures: number) {
  if (failures <= 0) return interval;
  const factor = Math.min(2 ** (failures - 1), 8);
  return Math.min(interval * factor, MAX_INTERVAL_MINUTES);
}

/**
 * Claim a hook for this process. Returns false when another holder has an
 * unexpired lease, in which case the caller must skip rather than scan.
 */
export function claim(
  chainId: number,
  hookAddress: string,
  holder: string,
  leaseSeconds = 300,
) {
  const address = hookAddress.toLowerCase();
  const now = new Date();
  const until = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
  const existing = database()
    .prepare(
      "SELECT holder, locked_until FROM monitor_locks WHERE chain_id=? AND hook_address=?",
    )
    .get(chainId, address) as
    | { holder: string; locked_until: string }
    | undefined;
  if (existing && existing.holder !== holder && existing.locked_until > now.toISOString())
    return false;
  database()
    .prepare(
      `INSERT INTO monitor_locks(chain_id,hook_address,holder,locked_until) VALUES(?,?,?,?)
       ON CONFLICT(chain_id,hook_address) DO UPDATE SET holder=excluded.holder, locked_until=excluded.locked_until`,
    )
    .run(chainId, address, holder, until);
  return true;
}

export function release(chainId: number, hookAddress: string, holder: string) {
  database()
    .prepare(
      "DELETE FROM monitor_locks WHERE chain_id=? AND hook_address=? AND holder=?",
    )
    .run(chainId, hookAddress.toLowerCase(), holder);
}

export function recordRunStart(params: {
  chainId: number;
  hookAddress: string;
  trigger: string;
}) {
  const id = randomBytes(16).toString("hex");
  database()
    .prepare(
      `INSERT INTO monitor_runs(id,chain_id,hook_address,trigger,status,started_at)
       VALUES(?,?,?,?,'started',?)`,
    )
    .run(
      id,
      params.chainId,
      params.hookAddress.toLowerCase(),
      params.trigger,
      new Date().toISOString(),
    );
  return id;
}

export function recordRunFinish(
  runId: string,
  params: {
    status: "complete" | "failed" | "skipped";
    scanId?: string | null;
    blockNumber?: string | null;
    error?: string | null;
    stage?: string | null;
  },
) {
  database()
    .prepare(
      `UPDATE monitor_runs SET status=?, scan_id=?, block_number=?, error=?, stage=COALESCE(?, stage), finished_at=? WHERE id=?`,
    )
    .run(
      params.status,
      params.scanId ?? null,
      params.blockNumber ?? null,
      params.error ?? null,
      params.stage ?? null,
      new Date().toISOString(),
      runId,
    );
}

export function finishMonitor(params: {
  chainId: number;
  hookAddress: string;
  ok: boolean;
  blockNumber?: string | null;
  error?: string | null;
}) {
  const monitor = getMonitor(params.chainId, params.hookAddress);
  if (!monitor) return;
  const failures = params.ok ? 0 : monitor.consecutiveFailures + 1;
  const next = new Date(
    Date.now() + backoffMinutes(monitor.intervalMinutes, failures) * 60_000,
  ).toISOString();
  database()
    .prepare(
      `UPDATE monitors SET last_run_at=?, last_run_status=?, last_run_block=?,
         last_error=?, consecutive_failures=?, next_run_at=?
       WHERE chain_id=? AND hook_address=?`,
    )
    .run(
      new Date().toISOString(),
      params.ok ? "complete" : "failed",
      params.blockNumber ?? monitor.lastRunBlock,
      params.ok ? null : (params.error ?? "unknown error"),
      failures,
      next,
      params.chainId,
      params.hookAddress.toLowerCase(),
    );
}

/** A monitor is due when it is enabled and its next_run_at has passed. */
export function dueMonitors(now = new Date()): MonitorRow[] {
  const rows = database()
    .prepare(
      `SELECT * FROM monitors WHERE enabled=1 AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY next_run_at ASC LIMIT 25`,
    )
    .all(now.toISOString()) as Record<string, unknown>[];
  return rows.map(fromRow);
}

/**
 * Recover after a restart.
 *
 * Called once at scheduler start. It does three things and nothing more:
 * - marks any run still `started` from a previous process as `failed` with an
 *   explicit reason, so an interrupted run is never displayed as in progress;
 * - clears lock rows whose lease has expired, so they cannot block a hook;
 * - does NOT fabricate a catch-up scan. A missed interval is simply due again,
 *   which `dueMonitors` already handles.
 */
export function recoverAfterRestart() {
  const interrupted = database()
    .prepare(
      `UPDATE monitor_runs SET status='failed', error='Server restarted before this run finished; it will be retried on the next interval.', finished_at=?
       WHERE status='started'`,
    )
    .run(new Date().toISOString());
  const expired = database()
    .prepare("DELETE FROM monitor_locks WHERE locked_until <= ?")
    .run(new Date().toISOString());
  return {
    interruptedRuns: Number(interrupted.changes),
    expiredLocks: Number(expired.changes),
  };
}

/** Hooks that have been scanned but are not yet monitored, for the UI listing. */
export function monitoredHooks() {
  return listMonitors().map((m) => {
    const hook = repo.getHook(m.chainId, m.hookAddress);
    return {
      ...m,
      hookStatus: hook?.hookStatus ?? null,
      scanCount: hook?.scanCount ?? 0,
      lastScannedAt: hook?.lastScannedAt ?? null,
    };
  });
}

export { db };
