import { beforeAll, describe, expect, it } from "vitest";
import * as monitor from "../src/server/monitor";
import { database } from "../src/server/db";

// Monitoring behaviour against a real in-memory SQLite database.
//
// These cover the properties that make scheduled scanning safe to run, not just
// the happy path: one hook must never be scanned twice at once, a crashed
// process must not block a hook forever, and a failure must be recorded rather
// than swallowed.

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
});

const CHAIN = 8453;
const HOOK = "0xB20000000000000000000033c5d4e307c52fce01";

describe("monitor registry", () => {
  it("registers a hook and normalises the address", () => {
    const m = monitor.addMonitor({
      chainId: CHAIN,
      hookAddress: HOOK,
      intervalMinutes: 30,
    });
    expect(m).not.toBeNull();
    expect(m!.hookAddress).toBe(HOOK.toLowerCase());
    expect(m!.enabled).toBe(true);
    expect(m!.intervalMinutes).toBe(30);
  });

  it("clamps an out-of-range interval instead of accepting it", () => {
    const tooSmall = monitor.addMonitor({
      chainId: CHAIN,
      hookAddress: "0x0000000000000000000000000000000000000001",
      intervalMinutes: 0,
    });
    expect(tooSmall!.intervalMinutes).toBe(monitor.MIN_INTERVAL_MINUTES);
    const tooBig = monitor.addMonitor({
      chainId: CHAIN,
      hookAddress: "0x0000000000000000000000000000000000000002",
      intervalMinutes: 999999,
    });
    expect(tooBig!.intervalMinutes).toBe(monitor.MAX_INTERVAL_MINUTES);
  });

  it("is a no-op to add the same monitor twice", () => {
    const before = monitor.listMonitors().length;
    monitor.addMonitor({ chainId: CHAIN, hookAddress: HOOK, intervalMinutes: 30 });
    expect(monitor.listMonitors().length).toBe(before);
  });

  it("toggles enabled state", () => {
    const off = monitor.setEnabled(CHAIN, HOOK, false);
    expect(off!.enabled).toBe(false);
    expect(monitor.dueMonitors()).not.toContainEqual(
      expect.objectContaining({ hookAddress: HOOK.toLowerCase() }),
    );
    const on = monitor.setEnabled(CHAIN, HOOK, true);
    expect(on!.enabled).toBe(true);
  });
});

describe("monitor locking", () => {
  it("grants the lease to exactly one holder", () => {
    expect(monitor.claim(CHAIN, HOOK, "process-a", 300)).toBe(true);
    expect(monitor.claim(CHAIN, HOOK, "process-b", 300)).toBe(false);
    // The same holder may re-enter (idempotent renew).
    expect(monitor.claim(CHAIN, HOOK, "process-a", 300)).toBe(true);
    monitor.release(CHAIN, HOOK, "process-a");
  });

  it("refuses to release another holder's lease", () => {
    monitor.claim(CHAIN, HOOK, "process-a", 300);
    monitor.release(CHAIN, HOOK, "process-b");
    // A's lease still stands because B never owned it.
    expect(monitor.claim(CHAIN, HOOK, "process-b", 300)).toBe(false);
    monitor.release(CHAIN, HOOK, "process-a");
  });

  it("lets a second holder take over after the lease expires", () => {
    monitor.claim(CHAIN, HOOK, "process-a", 300);
    // Push the lease into the past rather than waiting 300 seconds.
    database()
      .prepare(
        "UPDATE monitor_locks SET locked_until=? WHERE chain_id=? AND hook_address=?",
      )
      .run(new Date(Date.now() - 1000).toISOString(), CHAIN, HOOK.toLowerCase());
    expect(monitor.claim(CHAIN, HOOK, "process-b", 300)).toBe(true);
    monitor.release(CHAIN, HOOK, "process-b");
  });
});

describe("monitor runs and failure handling", () => {
  it("records a run as started, then complete", () => {
    const runId = monitor.recordRunStart({
      chainId: CHAIN,
      hookAddress: HOOK,
      trigger: "schedule",
    });
    let runs = monitor.listRuns();
    expect(runs.find((r) => r.id === runId)!.status).toBe("started");
    monitor.recordRunFinish(runId, {
      status: "complete",
      scanId: "00000000-0000-4000-8000-0000000000aa",
      blockNumber: "12345",
    });
    runs = monitor.listRuns();
    const run = runs.find((r) => r.id === runId)!;
    expect(run.status).toBe("complete");
    expect(run.blockNumber).toBe("12345");
    expect(run.finishedAt).not.toBeNull();
  });

  it("keeps the error and backs off after a failure", () => {
    monitor.finishMonitor({
      chainId: CHAIN,
      hookAddress: HOOK,
      ok: false,
      error: "RPC unavailable",
    });
    const failed = monitor.getMonitor(CHAIN, HOOK)!;
    expect(failed.lastRunStatus).toBe("failed");
    expect(failed.lastError).toBe("RPC unavailable");
    expect(failed.consecutiveFailures).toBe(1);
    // Backoff: next run is pushed past the base interval.
    const intervalMs = failed.intervalMinutes * 60_000;
    const delay = Date.parse(failed.nextRunAt!) - Date.now();
    expect(delay).toBeGreaterThan(intervalMs * 0.9);
  });

  it("resets the failure count and clears the error on success", () => {
    monitor.finishMonitor({
      chainId: CHAIN,
      hookAddress: HOOK,
      ok: true,
      blockNumber: "99999",
    });
    const ok = monitor.getMonitor(CHAIN, HOOK)!;
    expect(ok.consecutiveFailures).toBe(0);
    expect(ok.lastError).toBeNull();
    expect(ok.lastRunStatus).toBe("complete");
    expect(ok.lastRunBlock).toBe("99999");
  });

  it("grows the backoff with repeated failures but caps it", () => {
    const hook = "0x00000000000000000000000000000000000000f1";
    monitor.addMonitor({ chainId: CHAIN, hookAddress: hook, intervalMinutes: 5 });
    for (let i = 0; i < 12; i++)
      monitor.finishMonitor({
        chainId: CHAIN,
        hookAddress: hook,
        ok: false,
        error: "still failing",
      });
    const m = monitor.getMonitor(CHAIN, hook)!;
    expect(m.consecutiveFailures).toBe(12);
    // Capped at 8x the interval, never unbounded.
    const delay = Date.parse(m.nextRunAt!) - Date.now();
    expect(delay).toBeLessThanOrEqual(5 * 8 * 60_000 + 5_000);
  });
});

describe("restart recovery", () => {
  it("marks interrupted runs failed and clears expired locks", () => {
    const runId = monitor.recordRunStart({
      chainId: CHAIN,
      hookAddress: HOOK,
      trigger: "schedule",
    });
    monitor.claim(CHAIN, HOOK, "dead-process", 300);
    database()
      .prepare(
        "UPDATE monitor_locks SET locked_until=? WHERE chain_id=? AND hook_address=?",
      )
      .run(new Date(Date.now() - 1000).toISOString(), CHAIN, HOOK.toLowerCase());

    const result = monitor.recoverAfterRestart();
    expect(result.interruptedRuns).toBeGreaterThanOrEqual(1);
    expect(result.expiredLocks).toBeGreaterThanOrEqual(1);

    const run = monitor.listRuns().find((r) => r.id === runId)!;
    expect(run.status).toBe("failed");
    expect(run.error).toContain("restarted");

    // The hook is immediately claimable again, not blocked by the dead holder.
    expect(monitor.claim(CHAIN, HOOK, "new-process", 300)).toBe(true);
    monitor.release(CHAIN, HOOK, "new-process");
  });
});

describe("due selection", () => {
  it("returns only enabled monitors whose time has passed", () => {
    const disabled = monitor.addMonitor({
      chainId: CHAIN,
      hookAddress: "0x00000000000000000000000000000000000000e1",
      intervalMinutes: 5,
    })!;
    monitor.setEnabled(CHAIN, disabled.hookAddress, false);
    const due = monitor.dueMonitors();
    expect(
      due.some((m) => m.hookAddress === disabled.hookAddress),
    ).toBe(false);
    for (const m of due) expect(m.enabled).toBe(true);
  });
});
