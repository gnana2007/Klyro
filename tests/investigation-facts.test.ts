import { beforeAll, describe, expect, it } from "vitest";
import * as repo from "../src/server/repository";
import { snapshot } from "./fixtures";
import { canonical, hash } from "../src/core/canonical";
import { compareSnapshots } from "../src/core/diff";

// Regression coverage for the investigation facts added to the snapshot
// (hook status, deployment, participants, activity summary).
//
// These assert the honesty rules, not just the happy path: UNKNOWN stays
// distinguishable from an observed value, a participant cannot exist without
// the evidence that justified it, and adding these fields must not make two
// different observations hash the same.

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
});

describe("snapshot investigation facts", () => {
  it("keeps UNKNOWN deployment distinct from an observed one", () => {
    const s = snapshot();
    expect(s.deployment?.status).toBe("UNKNOWN");
    expect(s.deployment?.deployer).toBeNull();
    // An UNKNOWN deployment must not be silently treated as "no deployer".
    expect(s.deployment).not.toBeNull();
  });

  it("serializes through canonical JSON (no bigint/undefined leakage)", () => {
    const s = snapshot();
    s.deployment = {
      status: "OBSERVED",
      txHash: "0x" + "ab".repeat(32),
      blockNumber: "123",
      timestamp: "2026-11-01T00:00:00.000Z",
      deployer: "0x00000000000000000000000000000000000000d1",
      method: "creation transaction",
    };
    s.participants = [
      {
        address: "0x00000000000000000000000000000000000000d1",
        role: "deployer",
        evidence: "creation transaction 0x… at block 123",
        status: "OBSERVED",
      },
    ];
    s.activity = {
      status: "OBSERVED",
      fromBlock: "100",
      toBlock: "123",
      counts: { swap: 2 },
      total: 2,
      lastIndexedBlock: "123",
      reason: null,
    };
    expect(() => canonical(s)).not.toThrow();
    expect(hash(s)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes the record hash when the observation window changes", () => {
    // The state fingerprint deliberately excludes block/window data; the
    // passport hash of the whole snapshot must not.
    const a = snapshot();
    const b = snapshot();
    b.activity = {
      status: "OBSERVED",
      fromBlock: "1",
      toBlock: "2",
      counts: { swap: 1 },
      total: 1,
      lastIndexedBlock: "2",
      reason: null,
    };
    expect(a.stateFingerprint).toBe(b.stateFingerprint);
    expect(hash(a)).not.toBe(hash(b));
  });

  it("reports a new participant as a diff change, not as unchanged", () => {
    const before = snapshot();
    const after = snapshot();
    after.id = "00000000-0000-4000-8000-000000000002";
    after.blockNumber = "2";
    after.scannedAt = "2026-11-06T01:00:00.000Z";
    after.participants = [
      {
        address: "0x00000000000000000000000000000000000000d2",
        role: "swapper",
        evidence: "sender of 1 observed Swap.sender event(s)",
        status: "OBSERVED",
      },
    ];
    const diff = compareSnapshots(before, after);
    const row = diff.changes.find((c) => c.field === "participants");
    expect(row).toBeDefined();
    expect(row!.status).toBe("changed");
  });
});

describe("relational persistence from snapshot facts", () => {
  it("records participants with the evidence that justified each role", () => {
    repo.upsertParticipant({
      chainId: 8453,
      hookAddress: "0xB20000000000000000000033c5d4e307c52fce01",
      address: "0x00000000000000000000000000000000000000d3",
      role: "liquidity-provider",
      evidence: "sender of 2 observed ModifyLiquidity.sender event(s)",
      status: "OBSERVED",
      activityCount: 2,
    });
    const rows = repo.listParticipants(
      8453,
      "0xb20000000000000000000033c5d4e307c52fce01",
    );
    const row = rows.find(
      (r) => r.address === "0x00000000000000000000000000000000000000d3",
    );
    expect(row?.role).toBe("liquidity-provider");
    expect(row?.evidence).toContain("ModifyLiquidity.sender");
    expect(row?.activityCount).toBe(2);
  });

  it("does not invent activity for a quiet window", () => {
    const page = repo.listActivities({
      chainId: 8453,
      hookAddress: "0xB20000000000000000000033c5d4e307c52fce01",
    });
    expect(page.total).toBe(0);
    expect(page.activities).toEqual([]);
  });

  it("dedupes repeated activity on (chain, tx, logIndex)", () => {
    const item: repo.ActivityInput = {
      chainId: 8453,
      hookAddress: "0xb20000000000000000000033c5d4e307c52fce01",
      txHash: "0x" + "cd".repeat(32),
      logIndex: 7,
      blockNumber: "42",
      blockTimestamp: "2026-11-06T00:00:00.000Z",
      kind: "swap",
      eventName: "Swap",
      sender: "0x00000000000000000000000000000000000000d4",
      recipient: null,
      poolId: "0x" + "ef".repeat(32),
      token0: null,
      token1: null,
      amount0: "-1",
      amount1: "1",
      fee: "500",
      data: {},
      source: "PoolManager Swap log",
      status: "OBSERVED",
      scanId: null,
    };
    expect(repo.recordActivities([item])).toBe(1);
    expect(repo.recordActivities([item])).toBe(0);
    expect(
      repo.listActivities({
        chainId: 8453,
        hookAddress: "0xb20000000000000000000033c5d4e307c52fce01",
      }).total,
    ).toBe(1);
  });
});
