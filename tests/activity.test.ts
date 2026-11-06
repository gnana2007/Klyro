import { describe, it, expect } from "vitest";
import { participantsFromActivity } from "../src/server/activity";
import type { ActivityInput } from "../src/server/repository";

// The indexer's own network calls are covered by the live probe recorded in
// docs/CHECKLIST.md. What is unit-tested here is the pure attribution logic:
// given observed logs, which roles may be claimed and on what evidence.

const activity = (over: Partial<ActivityInput>): ActivityInput => ({
  chainId: 1,
  hookAddress: "0xhook000000000000000000000000000000000001",
  txHash: "0xtx",
  logIndex: 0,
  blockNumber: "100",
  blockTimestamp: "2026-11-06T00:00:00.000Z",
  kind: "swap",
  eventName: "Swap",
  sender: "0xsender",
  recipient: null,
  poolId: "0xpool",
  token0: "0xt0",
  token1: "0xt1",
  amount0: "-1",
  amount1: "2",
  fee: "3000",
  data: {},
  source: "PoolManager Swap log",
  status: "OBSERVED",
  scanId: null,
  ...over,
});

describe("participant derivation", () => {
  it("derives a swapper only from observed swap senders", () => {
    const roles = participantsFromActivity(1, "0xhook", [
      activity({ sender: "0xAAA" }),
      activity({ sender: "0xAAA", txHash: "0xtx2", logIndex: 1 }),
      activity({ sender: "0xBBB", txHash: "0xtx3", logIndex: 2 }),
    ]);
    const swappers = roles.filter((r) => r.role === "swapper");
    expect(swappers).toHaveLength(2);
    const aaa = swappers.find((r) => r.address === "0xaaa");
    expect(aaa?.activityCount).toBe(2);
    expect(aaa?.evidence).toContain("2 observed");
    expect(aaa?.status).toBe("OBSERVED");
  });

  it("separates liquidity providers from swappers for the same address", () => {
    const roles = participantsFromActivity(1, "0xhook", [
      activity({ sender: "0xSAME" }),
      activity({ sender: "0xSAME", kind: "liquidity-added", txHash: "0xtx2" }),
    ]);
    expect(roles.map((r) => r.role).sort()).toEqual([
      "liquidity-provider",
      "swapper",
    ]);
  });

  it("never invents a participant when the sender is absent", () => {
    const roles = participantsFromActivity(1, "0xhook", [
      activity({ sender: null }),
      activity({ sender: null, txHash: "0xtx2", kind: "pool-initialized" }),
    ]);
    expect(roles).toHaveLength(0);
  });

  it("records first and last observed timestamps", () => {
    const roles = participantsFromActivity(1, "0xhook", [
      activity({ sender: "0xAAA", blockTimestamp: "2026-01-02T00:00:00.000Z" }),
      activity({ sender: "0xAAA", txHash: "0xtx2", blockTimestamp: "2026-01-01T00:00:00.000Z" }),
    ]);
    const aaa = roles[0];
    expect(aaa.firstSeenAt).toBe("2026-01-01T00:00:00.000Z");
    expect(aaa.lastSeenAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("counts donors as recipients, not as liquidity providers", () => {
    const roles = participantsFromActivity(1, "0xhook", [
      activity({ sender: "0xDONOR", kind: "donation", eventName: "Donate" }),
    ]);
    expect(roles).toHaveLength(1);
    expect(roles[0].role).toBe("recipient");
  });
});
