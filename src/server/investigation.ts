import { getAddress, keccak256, parseAbi, type Address } from "viem";
import { decodePermissions, validPermissionDependencies } from "../core/permissions";
import { verifiedClient, pinnedBlock, withRetry, type ProviderError } from "./provider";
import { NETWORKS } from "./chains";
import { resolveProxy } from "./proxy";
import { verifiedSource } from "./source";
import { indexHookActivity, managerFor, participantsFromActivity } from "./activity";
import * as repo from "./repository";

// Hook investigation service.
//
// Answers "what is this, who deployed it, which pools use it, and what has it
// done" strictly from chain evidence. Where a question cannot be answered from
// the available data, the answer is `UNKNOWN` with a stated reason; it is never
// defaulted to something convenient.

const ARCHIVE_HINTS = [
  "archive",
  "personal token",
  "history is not available",
  "missing trie node",
] as const;

/** Providers reject old-state reads with several different messages. */
function isArchiveRestriction(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return ARCHIVE_HINTS.some((hint) => lower.includes(hint));
}

export type DeploymentFacts = {
  status: "OBSERVED" | "UNKNOWN";
  txHash: string | null;
  blockNumber: string | null;
  timestamp: string | null;
  deployer: string | null;
  method: string;
  limitations: string[];
};

/**
 * Discover deployment facts without an indexer contract-creation API.
 *
 * We probe contract code at the scanned block and, when the address has code,
 * walk backwards in bounded steps to find the first block where code appears.
 * The deployer is then read from that block's creation transaction. This is
 * deliberately bounded and reports UNKNOWN when the window does not contain
 * the creation, instead of guessing.
 */
export async function discoverDeployment(
  chainId: number,
  address: string,
  atBlock: bigint,
  step = 5_000n,
  maxSteps = 40,
): Promise<DeploymentFacts> {
  const limitations: string[] = [
    "Deployment is located by bounded backward code probing, not by an indexer. If creation precedes the probed window it is reported UNKNOWN.",
  ];
  const client = await verifiedClient(chainId);
  try {
    let lo: bigint | null = null;
    let cursor = atBlock;
    let archiveLimited = false;
    const codeAt = (blockNumber: bigint) =>
      withRetry(() =>
        client.getCode({ address: getAddress(address) as Address, blockNumber }),
      ).catch((error: unknown) => {
        if (isArchiveRestriction(error)) {
          archiveLimited = true;
          return null;
        }
        throw error;
      });
    for (let i = 0; i < maxSteps; i++) {
      const code = await codeAt(cursor);
      if (archiveLimited) break;
      if (!code || code === "0x") break;
      lo = cursor;
      if (cursor === 0n) break;
      const next = cursor > step ? cursor - step : 0n;
      const prevCode = await codeAt(next);
      if (archiveLimited) break;
      if (!prevCode || prevCode === "0x") break;
      cursor = next;
    }
    if (archiveLimited)
      return {
        status: "UNKNOWN", txHash: null, blockNumber: null, timestamp: null,
        deployer: null, method: "backward code probing (stopped)",
        limitations: [
          ...limitations,
          "The configured RPC does not serve archival state, so historical code probing stopped early. Deployment details need an archive-capable RPC endpoint (for example an authenticated provider URL in RPC_ETHEREUM).",
        ],
      };
    if (lo === null)
      return {
        status: "UNKNOWN", txHash: null, blockNumber: null, timestamp: null,
        deployer: null, method: "backward code probing",
        limitations: [...limitations, "No code was observed at the anchored block."],
      };
    // Binary-search down to the first block that has code.
    let high = lo;
    let low = 0n;
    while (low < high) {
      const mid = (low + high) / 2n;
      const code = await withRetry(() =>
        client.getCode({ address: getAddress(address) as Address, blockNumber: mid }),
      );
      if (code && code !== "0x") high = mid;
      else low = mid + 1n;
    }
    const creationBlock = high;
    const block = await withRetry(() => client.getBlock({ blockNumber: creationBlock }));
    const target = getAddress(address).toLowerCase();
    let txHash: string | null = null;
    let deployer: string | null = null;
    // `includeTransactions` guarantees decoded transactions, so the hash/from
    // fields are available without a second lookup per transaction.
    const fullBlock = await withRetry(() =>
      client.getBlock({ blockNumber: creationBlock, includeTransactions: true }),
    );
    for (const tx of fullBlock.transactions) {
      if (typeof tx === "string") continue;
      const receipt = await withRetry(() =>
        client.getTransactionReceipt({ hash: tx.hash }),
      ).catch(() => null);
      if (!receipt) continue;
      const match = receipt.contractAddress?.toLowerCase() === target;
      if (match) {
        txHash = tx.hash;
        deployer = tx.from;
        break;
      }
    }
    if (!txHash) {
      return {
        status: "UNKNOWN",
        blockNumber: creationBlock.toString(),
        timestamp:
          block.timestamp === null
            ? null
            : new Date(Number(block.timestamp) * 1000).toISOString(),
        txHash: null, deployer: null,
        method: "first-block-with-code plus transaction receipts",
        limitations: [
          ...limitations,
          "Code first appears at this block but no transaction in it reports this contract creation (factory or internal CREATE2 deployment). The deployer is not claimed.",
        ],
      };
    }
    return {
      status: "OBSERVED",
      txHash,
      blockNumber: creationBlock.toString(),
      timestamp:
        block.timestamp === null
          ? null
          : new Date(Number(block.timestamp) * 1000).toISOString(),
      deployer,
      method: "first-block-with-code plus creation transaction receipt",
      limitations,
    };
  } catch (error) {
    return {
      status: "UNKNOWN", txHash: null, blockNumber: null, timestamp: null,
      deployer: null, method: "backward code probing",
      limitations: [
        ...limitations,
        `Deployment lookup failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ],
    };
  }
}

export type HookInvestigation = {
  chainId: number;
  address: string;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: string;
  codeSize: number;
  runtimeHash: string;
  permissionBitmap: number;
  permissions: ReturnType<typeof decodePermissions>;
  permissionValid: boolean;
  hookStatus: repo.HookStatus;
  isHook: boolean;
  owner: string | null;
  proxy: Awaited<ReturnType<typeof resolveProxy>>;
  source: { status: "VERIFIED" | "UNKNOWN"; url: string | null; fileNames: string[] };
  deployer: DeploymentFacts;
  pools: Awaited<ReturnType<typeof indexHookActivity>>["pools"];
  activity: Awaited<ReturnType<typeof indexHookActivity>>;
  participants: ReturnType<typeof participantsFromActivity>;
  limitations: string[];
};

const OWNER_HINTS = ["owner", "admin", "governance"] as const;

/**
 * Full investigation of one address at one pinned block.
 *
 * `isHook` is decided by observation only: code present, and either a pool
 * initialized with this address as its hooks contract or a permission bitmap
 * that differs from the address's own low bits (which cannot happen) is not
 * enough — PoolManager association is the deciding evidence.
 */
export async function investigateHook(params: {
  chainId: number;
  address: string;
  poolFromBlock?: bigint;
  scanId?: string | null;
  windowBlocks?: bigint;
}): Promise<HookInvestigation> {
  const address = getAddress(params.address);
  const client = await verifiedClient(params.chainId);
  const anchor = await pinnedBlock(client);

  const code = await withRetry(() =>
    client.getCode({ address, blockNumber: anchor.number }),
  );
  if (!code || code === "0x")
    throw new Error("No deployed code at this address and block");

  const [proxy, ownerRead] = await Promise.all([
    resolveProxy(client, address, code, anchor.number),
    withRetry(() =>
      client.readContract({
        address,
        abi: parseAbi(["function owner() view returns (address)"]),
        functionName: "owner",
        blockNumber: anchor.number,
      }),
    ).catch(() => null),
  ]);

  const permissions = decodePermissions(address);
  const permissionBitmap = Number(BigInt(address) & 16383n);
  const permissionValid = validPermissionDependencies(permissions);

  const source = await verifiedSource(
    params.chainId,
    proxy.implementation ?? address,
    proxy.implementationHash ?? keccak256(code),
  );

  const windowBlocks = params.windowBlocks ?? 300n;
  const from = params.poolFromBlock ?? (anchor.number > windowBlocks ? anchor.number - windowBlocks : 0n);
  const activity = await indexHookActivity(client, {
    chainId: params.chainId,
    address,
    fromBlock: from,
    toBlock: anchor.number,
    scanId: params.scanId ?? null,
  });

  const deployer = await discoverDeployment(params.chainId, address, anchor.number);

  const isHook = activity.pools.length > 0;
  const hookStatus: repo.HookStatus = isHook
    ? "POOL_OBSERVED"
    : permissionBitmap === 0
      ? "NOT_A_HOOK"
      : "ADDRESS_ONLY";

  const limitations = [
    "Address permission bits describe capability, not behaviour.",
    "Hook callbacks are not individually observable as logs; activity records PoolManager events for associated pools.",
    ...activity.limitations,
    ...deployer.limitations,
    ...proxy.limitations,
  ];
  if (!isHook)
    limitations.push(
      "No pool was observed using this address as its hooks contract inside the scanned range. It may still be a hook with older or out-of-range pools.",
    );

  return {
    chainId: params.chainId,
    address,
    blockNumber: anchor.number.toString(),
    blockHash: anchor.hash,
    blockTimestamp: anchor.timestampIso,
    codeSize: (code.length - 2) / 2,
    runtimeHash: keccak256(code),
    permissionBitmap,
    permissions,
    permissionValid,
    hookStatus,
    isHook,
    owner: ownerRead,
    proxy,
    source: {
      status: source.status,
      url: source.url,
      fileNames: source.files.map((f) => f.name),
    },
    deployer,
    pools: activity.pools,
    activity,
    participants: participantsFromActivity(params.chainId, address, activity.activities),
    limitations: [...new Set(limitations)],
  };
}

/** Persist an investigation: hook summary, activities, participants. */
export function persistInvestigation(
  result: HookInvestigation,
  scanId: string | null,
): { activitiesInserted: number; participantsRecorded: number } {
  repo.upsertHook({
    chainId: result.chainId,
    address: result.address,
    status: result.hookStatus,
    isHook: result.isHook,
    deployer: result.deployer.deployer,
    deploymentTxHash: result.deployer.txHash,
    deploymentBlock: result.deployer.blockNumber,
    deploymentTimestamp: result.deployer.timestamp,
    scanId,
  });
  const activitiesInserted = repo.recordActivities(result.activity.activities);
  let participantsRecorded = 0;
  for (const p of result.participants) {
    repo.upsertParticipant({
      chainId: p.chainId,
      hookAddress: p.hookAddress,
      address: p.address,
      role: p.role,
      evidence: p.evidence,
      status: p.status,
      firstSeenAt: p.firstSeenAt,
      lastSeenAt: p.lastSeenAt,
      activityCount: p.activityCount,
      data: p.data,
    });
    participantsRecorded += 1;
  }
  if (result.owner)
    repo.upsertParticipant({
      chainId: result.chainId,
      hookAddress: result.address,
      address: result.owner,
      role: "owner",
      evidence: "owner() getter returned this address at the scanned block",
      status: "OBSERVED",
    });
  if (result.deployer.deployer)
    repo.upsertParticipant({
      chainId: result.chainId,
      hookAddress: result.address,
      address: result.deployer.deployer,
      role: "deployer",
      evidence: `creation transaction ${result.deployer.txHash} at block ${result.deployer.blockNumber}`,
      status: "OBSERVED",
    });
  if (result.proxy.admin)
    repo.upsertParticipant({
      chainId: result.chainId,
      hookAddress: result.address,
      address: result.proxy.admin,
      role: "proxy-admin",
      evidence: "EIP-1967 admin storage slot at the scanned block",
      status: "OBSERVED",
    });
  repo.setLastIndexedBlock(
    result.chainId,
    result.address,
    result.activity.toBlock,
  );
  return { activitiesInserted, participantsRecorded };
}

export function supportedManagers() {
  return NETWORKS.filter((n) => n.manager).map((n) => ({
    chainId: n.id,
    name: n.name,
    manager: n.manager,
  }));
}

export function managerForChain(chainId: number) {
  return managerFor(chainId);
}

export type { ProviderError };
export { OWNER_HINTS };
