import type { Snapshot } from "../core/types";
import { runScan } from "./scanner";
import * as monitor from "./monitor";
import { database } from "./db";

// The in-process scheduler.
//
// Started once from the Node runtime. Everything that could go wrong has an
// explicit path:
// - two processes contend for the same hook  -> the lease makes one skip;
// - a scan throws                             -> the run is marked failed, the
//                                                monitor backs off, the error
//                                                is kept for inspection;
// - the process dies mid-scan                 -> startup recovery marks the run
//                                                failed and expires the lease.
//
// MONITOR_ENABLED=false turns it off entirely, which is the correct setting for
// a serverless host where a long-lived interval does not exist.

const HOLDER = "klyro-" + Math.random().toString(36).slice(2, 10);
const TICK_MS = 30_000;

type State = {
  timer: ReturnType<typeof setInterval> | null;
  startedAt: string | null;
  lastTickAt: string | null;
  lastTickError: string | null;
  runsThisProcess: number;
  recovery: { interruptedRuns: number; expiredLocks: number } | null;
  running: boolean;
};

const state: State = {
  timer: null,
  startedAt: null,
  lastTickAt: null,
  lastTickError: null,
  runsThisProcess: 0,
  recovery: null,
  running: false,
};

/**
 * The scheduler runs inside `instrumentation.ts`, while API routes may be
 * bundled as separate module instances. In-memory state therefore is not
 * shared between them, and a naive `!!state.timer` would report the scheduler
 * as stopped. The heartbeat below is written to SQLite each tick, so any
 * instance can answer "is a scheduler alive?" from durable state instead of
 * from memory it may not share.
 */
export function schedulerStatus() {
  let heartbeat: { lastTickAt: string | null; holder: string | null } = {
    lastTickAt: null,
    holder: null,
  };
  try {
    const row = database()
      .prepare(
        "SELECT value FROM scheduler_heartbeat WHERE key='tick' LIMIT 1",
      )
      .get() as { value: string } | undefined;
    if (row?.value) {
      const parsed = JSON.parse(row.value) as {
        lastTickAt: string;
        holder: string;
      };
      heartbeat = { lastTickAt: parsed.lastTickAt, holder: parsed.holder };
    }
  } catch {
    // A missing table before migration must not break a status read.
  }
  const localAlive = !!state.timer;
  const fresh =
    heartbeat.lastTickAt !== null &&
    Date.now() - Date.parse(heartbeat.lastTickAt) < TICK_MS * 4;
  return {
    enabled: localAlive || fresh,
    runningInThisInstance: localAlive,
    heartbeat: heartbeat,
    holder: heartbeat.holder ?? HOLDER,
    tickSeconds: TICK_MS / 1000,
    startedAt: state.startedAt,
    lastTickAt: state.lastTickAt,
    lastTickError: state.lastTickError,
    runsThisProcess: state.runsThisProcess,
    recovery: state.recovery,
    note: "Scheduled scans use the same runScan path as manual scans. A missed interval is not backfilled; it is simply due again.",
  };
}

/** Run every due monitor once. Exported so a test or an operator can force it. */
export async function tick(now = new Date()) {
  if (state.running) return { skipped: "previous tick still running", ran: 0 };
  state.running = true;
  state.lastTickAt = new Date().toISOString();
  try {
    database()
      .prepare(
        `INSERT INTO scheduler_heartbeat(key,value,updated_at) VALUES('tick',?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      )
      .run(
        JSON.stringify({ lastTickAt: state.lastTickAt, holder: HOLDER }),
        new Date().toISOString(),
      );
  } catch {
    // Heartbeat is diagnostic; a failure here must not stop monitoring.
  }
  let ran = 0;
  try {
    const due = monitor.dueMonitors(now);
    for (const m of due) {
      if (!monitor.claim(m.chainId, m.hookAddress, HOLDER)) continue;
      const runId = monitor.recordRunStart({
        chainId: m.chainId,
        hookAddress: m.hookAddress,
        trigger: "schedule",
      });
      try {
        const snapshot: Snapshot = await runScan(
          { chainId: m.chainId, address: m.hookAddress },
          { trigger: "schedule" },
        );
        monitor.recordRunFinish(runId, {
          status: "complete",
          scanId: snapshot.id,
          blockNumber: snapshot.blockNumber,
        });
        monitor.finishMonitor({
          chainId: m.chainId,
          hookAddress: m.hookAddress,
          ok: true,
          blockNumber: snapshot.blockNumber,
        });
        ran += 1;
        state.runsThisProcess += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown monitor error";
        const stage =
          error instanceof Error
            ? ((error as Error & { stage?: string }).stage ?? null)
            : null;
        monitor.recordRunFinish(runId, {
          status: "failed",
          error: message,
          stage,
        });
        monitor.finishMonitor({
          chainId: m.chainId,
          hookAddress: m.hookAddress,
          ok: false,
          error: message,
        });
        state.lastTickError = message;
        console.error(
          `monitor failed for ${m.hookAddress} on chain ${m.chainId}:`,
          message,
        );
      } finally {
        monitor.release(m.chainId, m.hookAddress, HOLDER);
      }
    }
    return { skipped: null, ran };
  } finally {
    state.running = false;
  }
}

export function startScheduler() {
  if (state.timer) return schedulerStatus();
  if (process.env.MONITOR_ENABLED === "false")
    return { ...schedulerStatus(), enabled: false, reason: "MONITOR_ENABLED=false" };
  state.recovery = monitor.recoverAfterRestart();
  state.startedAt = new Date().toISOString();
  state.timer = setInterval(() => {
    tick().catch((error) => {
      state.lastTickError =
        error instanceof Error ? error.message : "unknown scheduler error";
    });
  }, TICK_MS);
  // Do not keep the process alive purely for the scheduler during tests.
  state.timer.unref?.();
  return schedulerStatus();
}

export function stopScheduler() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
