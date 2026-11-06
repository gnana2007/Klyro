import { beforeAll, it, expect, vi } from "vitest";
import { snapshot } from "./fixtures";
import * as db from "../src/server/db";
beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
});
it("persists jobs, immutable snapshots, history and passports", () => {
  const s = snapshot();
  db.createJob({
    id: s.id,
    address: s.address,
    chainId: s.chainId,
    status: "queued",
    stage: "Queued",
    error: null,
    createdAt: s.scannedAt,
  });
  db.stageJob(s.id, "running", "Reading code");
  expect(db.getJob(s.id)?.status).toBe("running");
  db.saveSnapshot(s);
  expect(db.getJob(s.id)?.status).toBe("complete");
  expect(db.history(s.chainId, s.address)[0].runtimeHash).toBe(s.runtimeHash);
  expect(() => db.saveSnapshot(s)).toThrow();
});

/**
 * Regression for the production degradation. When the configured path cannot
 * be opened on a managed host the app must still read and write on an
 * ephemeral database, and must say so rather than pretend the configured path
 * worked.
 */
it("falls back to an ephemeral database on a serverless host and reports it", async () => {
  const saved = { ...process.env };
  try {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const blocker = join(mkdtempSync(join(tmpdir(), "klyro-test-")), "file");
    writeFileSync(blocker, "x");
    process.env.VERCEL = "1";
    process.env.DATABASE_PATH = join(blocker, "data", "klyro.sqlite");
    // A fresh module instance, so this case does not reuse the connection the
    // in-memory tests above already opened.
    vi.resetModules();
    const fallback = await import("../src/server/db");
    expect(() => fallback.database()).not.toThrow();
    expect(fallback.databaseLocation().path).toContain("klyro.sqlite");
    expect(fallback.activePath()).not.toBe(process.env.DATABASE_PATH);
    expect(fallback.lastDatabaseError()).toContain(
      "Running on an ephemeral database",
    );
    expect(fallback.recent()).toEqual({ scans: [], unreadable: [] });
  } finally {
    process.env = saved;
  }
});
