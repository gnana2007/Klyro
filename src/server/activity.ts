import { parseAbiItem, type Address } from "viem";
import type { KlyroClient } from "./chains";
import { NETWORKS } from "./chains";
import { getLogsBounded, withRetry } from "./provider";
import type { ActivityInput, ActivityKind } from "./repository";

// Activity indexing from official Uniswap v4 PoolManager events.
//
// Scope and honesty rules:
// - Every row produced here is `OBSERVED`: it came from a log the node
//   returned, at a specific block. Nothing is reconstructed or inferred.
// - Hook callbacks do not emit their own logs. The only on-chain trace of a
//   before/after callback firing is the PoolManager event it accompanies, so
//   this module never claims to be a complete record of callback executions.
// - Pool association comes from Initialize events whose `hooks` field equals
//   the investigated address. Swap/ModifyLiquidity/Donate carry only the pool
//   id, so they are attributed to pools that were already observed for this
//   hook; an unknown pool id is left unattributed rather than guessed.

export const POOL_MANAGER_EVENTS = {
  initialize: parseAbiItem(
    "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  ),
  modifyLiquidity: parseAbiItem(
    "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
  ),
  swap: parseAbiItem(
    "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  ),
  donate: parseAbiItem(
    "event Donate(bytes32 indexed id, address indexed sender, uint256 amount0, uint256 amount1)",
  ),
} as const;

export type ObservedPool = {
  poolId: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  sqrtPriceX96: string | null;
  blockNumber: string;
  txHash: string;
  logIndex: number;
};

export type IndexResult = {
  pools: ObservedPool[];
  activities: ActivityInput[];
  fromBlock: string;
  toBlock: string;
  blocksScanned: number;
  manager: string | null;
  limitations: string[];
  counts: Record<string, number>;
  /** Events in the range belonging to other hooks' pools. Informational only. */
  otherPoolEvents: Record<string, number>;
};

export function managerFor(chainId: number): string | null {
  return NETWORKS.find((n) => n.id === chainId)?.manager ?? null;
}

type RawLog = {
  blockNumber: bigint | null;
  transactionHash: string | null;
  logIndex: number | null;
  args: Record<string, unknown>;
};

/**
 * Index a bounded block range for one hook.
 *
 * `fromBlock` defaults to `toBlock - window`. A hook with older pool history
 * needs an explicit `poolFromBlock`; the limitations array says so rather than
 * implying the record is complete.
 */
export async function indexHookActivity(
  client: KlyroClient,
  params: {
    chainId: number;
    address: string;
    fromBlock: bigint;
    toBlock: bigint;
    scanId?: string | null;
  },
): Promise<IndexResult> {
  const manager = managerFor(params.chainId);
  const limitations: string[] = [];
  const activities: ActivityInput[] = [];
  const pools: ObservedPool[] = [];
  const counts: Record<string, number> = {};

  if (!manager) {
    return {
      pools,
      activities,
      fromBlock: params.fromBlock.toString(),
      toBlock: params.toBlock.toString(),
      blocksScanned: 0,
      manager: null,
      limitations: [
        "No verified PoolManager address is configured for this chain, so pool association and activity cannot be observed.",
      ],
      counts,
      otherPoolEvents: {},
    };
  }

  const blockRanges: number[] = [];
  const observed: Record<string, RawLog[]> = {};
  for (const [name, event] of Object.entries(POOL_MANAGER_EVENTS)) {
    const logs = (await getLogsBounded(client, {
      address: manager as Address,
      event,
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
    })) as RawLog[];
    observed[name] = logs;
    blockRanges.push(logs.length);
  }

  const blockCache = new Map<string, string | null>();
  const timestampFor = async (blockNumber: bigint): Promise<string | null> => {
    const key = blockNumber.toString();
    if (blockCache.has(key)) return blockCache.get(key)!;
    let value: string | null;
    try {
      const block = await withRetry(() => client.getBlock({ blockNumber }));
      value =
        block.timestamp === null
          ? null
          : new Date(Number(block.timestamp) * 1000).toISOString();
    } catch {
      value = null;
    }
    blockCache.set(key, value);
    return value;
  };

  const hook = params.address.toLowerCase();
  const poolIndex = new Map<string, ObservedPool>();

  // Initialize events define pool association: only these carry `hooks`.
  for (const log of observed.initialize ?? []) {
    const args = log.args;
    if (String(args.hooks).toLowerCase() !== hook) continue;
    const pool: ObservedPool = {
      poolId: String(args.id),
      currency0: String(args.currency0),
      currency1: String(args.currency1),
      fee: Number(args.fee),
      tickSpacing: Number(args.tickSpacing),
      sqrtPriceX96: args.sqrtPriceX96 ? String(args.sqrtPriceX96) : null,
      blockNumber: log.blockNumber?.toString() ?? "0",
      txHash: log.transactionHash ?? "",
      logIndex: log.logIndex ?? 0,
    };
    if (!poolIndex.has(pool.poolId.toLowerCase())) {
      poolIndex.set(pool.poolId.toLowerCase(), pool);
      pools.push(pool);
    }
    counts["pool-initialized"] = (counts["pool-initialized"] ?? 0) + 1;
    activities.push({
      chainId: params.chainId,
      hookAddress: hook,
      txHash: log.transactionHash ?? "",
      logIndex: log.logIndex ?? 0,
      blockNumber: log.blockNumber?.toString() ?? "0",
      blockTimestamp: log.blockNumber
        ? await timestampFor(log.blockNumber)
        : null,
      kind: "pool-initialized",
      eventName: "Initialize",
      sender: null,
      recipient: null,
      poolId: pool.poolId,
      token0: pool.currency0,
      token1: pool.currency1,
      amount0: null,
      amount1: null,
      fee: String(pool.fee),
      data: {
        currency0: pool.currency0,
        currency1: pool.currency1,
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
        hooks: String(args.hooks),
        sqrtPriceX96: pool.sqrtPriceX96,
      },
      source: "PoolManager Initialize log",
      status: "OBSERVED",
      scanId: params.scanId ?? null,
    });
  }

  const poolIds = new Set(poolIndex.keys());
  // PoolManager is shared by every pool on the chain, so most Swap/ModifyLiquidity
  // logs in a window belong to other hooks. That is expected high-volume traffic,
  // not a gap in this hook's record, so it is summarised rather than listed as a
  // limitation. Only the lack of pool association for this hook is a real gap.
  const otherPoolEvents: Record<string, number> = {};
  const addPoolScoped = async (
    name: keyof typeof POOL_MANAGER_EVENTS,
    kind: ActivityKind,
    eventName: string,
    map: (args: Record<string, unknown>) => {
      sender: string | null;
      amount0: string | null;
      amount1: string | null;
      fee: string | null;
      data: Record<string, unknown>;
    },
  ) => {
    for (const log of observed[name] ?? []) {
      const poolId = String(log.args.id);
      if (!poolIds.has(poolId.toLowerCase())) {
        otherPoolEvents[eventName] = (otherPoolEvents[eventName] ?? 0) + 1;
        continue;
      }      const pool = poolIndex.get(poolId.toLowerCase())!;
      const mapped = map(log.args);
      counts[kind] = (counts[kind] ?? 0) + 1;
      activities.push({
        chainId: params.chainId,
        hookAddress: hook,
        txHash: log.transactionHash ?? "",
        logIndex: log.logIndex ?? 0,
        blockNumber: log.blockNumber?.toString() ?? "0",
        blockTimestamp: log.blockNumber
          ? await timestampFor(log.blockNumber)
          : null,
        kind,
        eventName,
        sender: mapped.sender,
        recipient: null,
        poolId,
        token0: pool.currency0,
        token1: pool.currency1,
        amount0: mapped.amount0,
        amount1: mapped.amount1,
        fee: mapped.fee,
        data: mapped.data,
        source: `PoolManager ${eventName} log`,
        status: "OBSERVED",
        scanId: params.scanId ?? null,
      });
    }
  };

  await addPoolScoped("swap", "swap", "Swap", (a) => ({
    sender: a.sender ? String(a.sender) : null,
    amount0: a.amount0 === undefined ? null : String(a.amount0),
    amount1: a.amount1 === undefined ? null : String(a.amount1),
    fee: a.fee === undefined ? null : String(a.fee),
    data: {
      sqrtPriceX96: a.sqrtPriceX96 ? String(a.sqrtPriceX96) : null,
      liquidity: a.liquidity ? String(a.liquidity) : null,
      tick: a.tick === undefined ? null : Number(a.tick),
    },
  }));

  await addPoolScoped(
    "modifyLiquidity",
    "liquidity-added",
    "ModifyLiquidity",
    (a) => ({
      sender: a.sender ? String(a.sender) : null,
      amount0: null,
      amount1: null,
      fee: null,
      data: {
        tickLower: Number(a.tickLower),
        tickUpper: Number(a.tickUpper),
        liquidityDelta: a.liquidityDelta ? String(a.liquidityDelta) : null,
        salt: a.salt ? String(a.salt) : null,
      },
    }),
  );

  await addPoolScoped("donate", "donation", "Donate", (a) => ({
    sender: a.sender ? String(a.sender) : null,
    amount0: a.amount0 === undefined ? null : String(a.amount0),
    amount1: a.amount1 === undefined ? null : String(a.amount1),
    fee: null,
    data: {},
  }));

  // ModifyLiquidity covers both add and remove; split by the sign of the delta
  // so the ledger reports the direction actually emitted.
  for (const a of activities)
    if (a.kind === "liquidity-added" && a.data.liquidityDelta) {
      if (BigInt(String(a.data.liquidityDelta)) < 0n) {
        a.kind = "liquidity-removed";
        counts["liquidity-added"] = (counts["liquidity-added"] ?? 1) - 1;
        counts["liquidity-removed"] = (counts["liquidity-removed"] ?? 0) + 1;
      }
    }

  if (!pools.length)
    limitations.push(
      "No pool was initialized with this hook inside the scanned range. Older pools may exist outside it; absence here is not proof that none exist.",
    );
  limitations.push(
    "Hook callbacks do not emit their own events. This ledger records PoolManager events for this hook's pools, not a complete record of callback executions.",
  );

  return {
    pools,
    activities,
    fromBlock: params.fromBlock.toString(),
    toBlock: params.toBlock.toString(),
    blocksScanned: Number(params.toBlock - params.fromBlock) + 1,
    manager,
    limitations,
    counts,
    otherPoolEvents,
  };
}

/**
 * Derive participant roles strictly from observed activity. A role is only
 * recorded when a log supports it; nothing is inferred from a plausible story.
 */
export function participantsFromActivity(
  chainId: number,
  hookAddress: string,
  activities: ActivityInput[],
) {
  type Entry = {
    address: string;
    role:
      | "swapper"
      | "liquidity-provider"
      | "recipient";
    labels: Set<string>;
    count: number;
    first: string | null;
    last: string | null;
  };
  const map = new Map<string, Entry>();
  const bump = (
    address: string | null,
    role: Entry["role"],
    label: string,
    timestamp: string | null,
  ) => {
    if (!address) return;
    const key = role + ":" + address.toLowerCase();
    const entry = map.get(key) ?? {
      address: address.toLowerCase(),
      role,
      labels: new Set<string>(),
      count: 0,
      first: timestamp,
      last: timestamp,
    };
    entry.count += 1;
    entry.labels.add(label);
    if (timestamp) {
      if (!entry.first || timestamp < entry.first) entry.first = timestamp;
      if (!entry.last || timestamp > entry.last) entry.last = timestamp;
    }
    map.set(key, entry);
  };
  for (const a of activities) {
    if (a.kind === "swap") bump(a.sender, "swapper", "Swap.sender", a.blockTimestamp);
    if (a.kind === "liquidity-added" || a.kind === "liquidity-removed")
      bump(a.sender, "liquidity-provider", "ModifyLiquidity.sender", a.blockTimestamp);
    if (a.kind === "donation") bump(a.sender, "recipient", "Donate.sender", a.blockTimestamp);
  }
  return [...map.values()].map((e) => ({
    chainId,
    hookAddress,
    address: e.address,
    role: e.role,
    evidence: `sender of ${e.count} observed ${[...e.labels].join(", ")} event(s)`,
    status: "OBSERVED" as const,
    firstSeenAt: e.first,
    lastSeenAt: e.last,
    activityCount: e.count,
    data: { labels: [...e.labels] },
  }));
}
