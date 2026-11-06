import { beforeAll, it, expect } from "vitest";
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
