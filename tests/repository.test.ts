import { beforeAll, describe, it, expect } from "vitest";
import * as repo from "../src/server/repository";

// Repository behaviour against a real in-memory SQLite database. These are not
// mocks: the same SQL that runs in production runs here.

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
});

const baseActivity: repo.ActivityInput = {
  chainId: 1,
  hookAddress: "0xAAA0000000000000000000000000000000000001",
  txHash: "0xTX1",
  logIndex: 3,
  blockNumber: "100",
  blockTimestamp: "2026-11-06T00:00:00.000Z",
  kind: "swap",
  eventName: "Swap",
  sender: "0xSender",
  recipient: null,
  poolId: "0xpool",
  token0: "0xTokenA",
  token1: "0xTokenB",
  amount0: "-1000",
  amount1: "900",
  fee: "3000",
  data: { note: "observed" },
  source: "rpc:PoolManager",
  status: "OBSERVED",
  scanId: null,
};

describe("hook registry", () => {
  it("uses chain ID plus address as identity", () => {
    repo.upsertHook({ chainId: 1, address: "0xAbC0000000000000000000000000000000000001" });
    repo.upsertHook({ chainId: 8453, address: "0xAbC0000000000000000000000000000000000001" });
    const one = repo.getHook(1, "0xAbC0000000000000000000000000000000000001");
    const base = repo.getHook(8453, "0xAbC0000000000000000000000000000000000001");
    expect(one).not.toBeNull();
    expect(base).not.toBeNull();
    expect(one!.address).toBe(base!.address.toLowerCase());
    expect(one!.chainId).toBe(1);
    expect(base!.chainId).toBe(8453);
  });

  it("counts scans without losing deployment facts", () => {
    const address = "0xDEED000000000000000000000000000000000001";
    repo.upsertHook({
      chainId: 1,
      address,
      status: "POOL_OBSERVED",
      isHook: true,
      deployer: "0xDEPLOYER",
      deploymentTxHash: "0xDEPTX",
      deploymentBlock: "99",
    });
    const afterScan = repo.upsertHook({ chainId: 1, address, scanId: "scan-1" });
    expect(afterScan.scanCount).toBe(1);
    expect(afterScan.deployer).toBe("0xdeployer");
    expect(afterScan.deploymentBlock).toBe("99");
    expect(afterScan.hookStatus).toBe("POOL_OBSERVED");
    // A later scan increments but must not erase the deployment record.
    const again = repo.upsertHook({ chainId: 1, address, scanId: "scan-2" });
    expect(again.scanCount).toBe(2);
    expect(again.deploymentTxHash).toBe("0xDEPTX");
  });

  it("archives without deleting history", () => {
    const address = "0xARCH000000000000000000000000000000000001";
    repo.upsertHook({ chainId: 1, address });
    repo.setArchived(1, address, true);
    const archived = repo.listHooks({ chainId: 1, archived: true }).hooks;
    expect(archived.some((h) => h.address === address.toLowerCase())).toBe(true);
    expect(
      repo.listHooks({ chainId: 1, archived: false }).hooks.some(
        (h) => h.address === address.toLowerCase(),
      ),
    ).toBe(false);
    // The row still exists and is still retrievable.
    expect(repo.getHook(1, address)).not.toBeNull();
  });
});

describe("activity ledger", () => {
  it("dedupes on (chain, tx, logIndex) across re-indexing", () => {
    const first = repo.recordActivities([baseActivity]);
    expect(first).toBe(1);
    const second = repo.recordActivities([baseActivity]);
    expect(second).toBe(0);
    const listed = repo.listActivities({
      chainId: 1,
      hookAddress: baseActivity.hookAddress,
    });
    expect(listed.total).toBe(1);
  });

  it("allows the same tx/log on another chain", () => {
    const onBase: repo.ActivityInput = {
      ...baseActivity,
      chainId: 8453,
      hookAddress: "0xAAA0000000000000000000000000000000000001",
    };
    expect(repo.recordActivities([onBase])).toBe(1);
  });

  it("filters by kind and by address", () => {
    const hook = "0xF11E000000000000000000000000000000000001";
    repo.recordActivities([
      { ...baseActivity, hookAddress: hook, txHash: "0xT1", logIndex: 0, kind: "swap" },
      { ...baseActivity, hookAddress: hook, txHash: "0xT2", logIndex: 0, kind: "liquidity-added", sender: "0xLP" },
      { ...baseActivity, hookAddress: hook, txHash: "0xT3", logIndex: 0, kind: "donation", sender: "0xDONOR" },
    ]);
    expect(repo.listActivities({ chainId: 1, hookAddress: hook, kind: "swap" }).total).toBe(1);
    expect(repo.listActivities({ chainId: 1, hookAddress: hook, address: "0xLP" }).total).toBe(1);
    expect(repo.activityKindCounts(1, hook)).toEqual({
      swap: 1,
      "liquidity-added": 1,
      donation: 1,
    });
  });

  it("paginates deterministically, newest block first", () => {
    const hook = "0xPAGE000000000000000000000000000000000001";
    for (let block = 1; block <= 7; block++)
      repo.recordActivities([
        { ...baseActivity, hookAddress: hook, txHash: "0xP" + block, logIndex: 0, blockNumber: String(block) },
      ]);
    const page1 = repo.listActivities({ chainId: 1, hookAddress: hook, limit: 3, offset: 0 });
    const page2 = repo.listActivities({ chainId: 1, hookAddress: hook, limit: 3, offset: 3 });
    expect(page1.total).toBe(7);
    expect(page1.activities.map((a) => a.blockNumber)).toEqual(["7", "6", "5"]);
    expect(page2.activities.map((a) => a.blockNumber)).toEqual(["4", "3", "2"]);
    // No overlap between pages.
    const ids = new Set(page1.activities.map((a) => a.id));
    expect(page2.activities.every((a) => !ids.has(a.id))).toBe(true);
  });

  it("tracks the last indexed block", () => {
    const hook = "0xIDX0000000000000000000000000000000000001";
    expect(repo.lastIndexedBlock(1, hook)).toBeNull();
    repo.setLastIndexedBlock(1, hook, "12345");
    expect(repo.lastIndexedBlock(1, hook)).toBe("12345");
    repo.setLastIndexedBlock(1, hook, "13000");
    expect(repo.lastIndexedBlock(1, hook)).toBe("13000");
  });
});

describe("participants", () => {
  it("stores each role with its own evidence and updates in place", () => {
    const hook = "0xPART000000000000000000000000000000000001";
    repo.upsertParticipant({
      chainId: 1,
      hookAddress: hook,
      address: "0xDeployer",
      role: "deployer",
      evidence: "contract creation in tx 0xabc",
      status: "OBSERVED",
      activityCount: 1,
    });
    repo.upsertParticipant({
      chainId: 1,
      hookAddress: hook,
      address: "0xDeployer",
      role: "deployer",
      evidence: "contract creation in tx 0xabc (re-confirmed)",
      status: "OBSERVED",
      activityCount: 2,
    });
    const list = repo.listParticipants(1, hook);
    expect(list).toHaveLength(1);
    expect(list[0].activityCount).toBe(2);
    expect(list[0].evidence).toContain("re-confirmed");
  });

  it("keeps distinct roles for the same address separate", () => {
    const hook = "0xPART000000000000000000000000000000000002";
    repo.upsertParticipant({
      chainId: 1, hookAddress: hook, address: "0xSame", role: "owner",
      evidence: "owner() getter returned this address", status: "OBSERVED",
    });
    repo.upsertParticipant({
      chainId: 1, hookAddress: hook, address: "0xSame", role: "swapper",
      evidence: "sender of 3 swap events", status: "OBSERVED",
    });
    expect(repo.listParticipants(1, hook)).toHaveLength(2);
    expect(repo.listParticipants(1, hook, "owner")).toHaveLength(1);
  });
});

describe("graph persistence", () => {
  it("round-trips nodes and edges for a scan", () => {
    const scanId = "scan-graph-1";
    repo.saveGraph(
      scanId, 1, "0xGRAP000000000000000000000000000000000001",
      [{ id: "hook", type: "Hook", label: "Hook", status: "OBSERVED", data: { a: 1 } }],
      [{ from: "hook", to: "permission:afterSwap", type: "HAS_PERMISSION", status: "OBSERVED", evidence: "address flags" }],
    );
    const g = repo.listGraph(scanId);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].type).toBe("HAS_PERMISSION");
  });

  it("replaces previous graph content instead of duplicating it", () => {
    const scanId = "scan-graph-2";
    const node = { id: "hook", type: "Hook", label: "Hook", status: "OBSERVED", data: null };
    repo.saveGraph(scanId, 1, "0xGRAP000000000000000000000000000000000002", [node], []);
    repo.saveGraph(scanId, 1, "0xGRAP000000000000000000000000000000000002", [node], []);
    expect(repo.listGraph(scanId).nodes).toHaveLength(1);
  });
});
