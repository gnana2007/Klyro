import type { KlyroClient } from "./chains";
import { clientFor, NETWORKS } from "./chains";

// Provider abstraction.
//
// Every chain read in Klyro goes through this module so that timeouts, retries,
// rate limits and reorg checks have exactly one implementation. Callers get a
// typed result or a typed failure; they never receive a silently partial answer.
//
// Design rules:
// - A failure is never converted into an empty result. `null`/`[]` must mean
//   "observed nothing", not "the request failed".
// - Retries are bounded and only applied to transient conditions.
// - Reads are always pinned to a block number, never to `latest`, so a result
//   can be reproduced later.

export type ProviderErrorKind =
  | "unsupported-chain" | "wrong-chain-id" | "timeout" | "rate-limited"
  | "transport" | "reorg" | "range" | "rejected";

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const RETRYABLE = new Set<ProviderErrorKind>(["timeout", "rate-limited", "transport"]);

function classify(error: unknown): ProviderError {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|rate limit|too many requests/i.test(message))
    return new ProviderError("rate-limited", "RPC rate limit reached", true);
  if (/timeout|timed out|ETIMEDOUT|aborted/i.test(message))
    return new ProviderError("timeout", "RPC request timed out", true);
  if (/ECONNRESET|ECONNREFUSED|socket hang up|fetch failed/i.test(message))
    return new ProviderError("transport", "RPC transport failure", true);
  return new ProviderError("transport", message, false);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run an RPC operation with bounded retries and exponential backoff.
 * Only transient provider errors are retried.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 250,
): Promise<T> {
  let last: ProviderError | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      last = error instanceof ProviderError ? error : classify(error);
      if (!last.retryable || attempt === attempts - 1) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw last ?? new ProviderError("transport", "RPC operation failed");
}

export function supportedChains() {
  return NETWORKS.map((n) => ({ id: n.id, name: n.name, manager: n.manager }));
}

export function isSupportedChain(chainId: number) {
  return NETWORKS.some((n) => n.id === chainId);
}

/**
 * Return a client whose reported chain ID matches the requested network.
 * A mismatch is a hard failure: analysing chain-1 bytecode as if it were Base
 * would corrupt every downstream finding.
 */
export async function verifiedClient(chainId: number): Promise<KlyroClient> {
  if (!isSupportedChain(chainId))
    throw new ProviderError("unsupported-chain", "Unsupported chain");
  const client = clientFor(chainId);
  const actual = await withRetry(() => client.getChainId());
  if (actual !== chainId)
    throw new ProviderError(
      "wrong-chain-id",
      `RPC reported chain ${actual} for requested chain ${chainId}`,
    );
  return client;
}

export type PinnedBlock = {
  number: bigint;
  hash: string;
  timestamp: bigint;
  timestampIso: string;
};

/** A block that can anchor an immutable report. Pending blocks cannot. */
export async function pinnedBlock(
  client: KlyroClient,
  blockNumber?: bigint,
): Promise<PinnedBlock> {
  const block = await withRetry(() =>
    client.getBlock(
      blockNumber === undefined
        ? { blockTag: "latest" }
        : { blockNumber },
    ),
  );
  if (block.number === null || !block.hash)
    throw new ProviderError("rejected", "Pending block cannot anchor a report");
  return {
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
    timestampIso: new Date(Number(block.timestamp) * 1000).toISOString(),
  };
}

/** Confirm the anchor block was not reorged while the scan ran. */
export async function confirmBlock(
  client: KlyroClient,
  block: PinnedBlock,
): Promise<void> {
  const again = await withRetry(() =>
    client.getBlock({ blockNumber: block.number }),
  );
  if (again.hash !== block.hash)
    throw new ProviderError(
      "reorg",
      "Chain reorganized during scan; retry at a finalized block",
    );
}

/**
 * Bounded, chunked log retrieval.
 *
 * Providers cap `eth_getLogs` ranges differently, so a single wide query is
 * unreliable. We split into chunks, and a chunk failure fails the whole call
 * rather than returning a short list that would look like "no events".
 */
export async function getLogsBounded(
  client: KlyroClient,
  params: {
    address: `0x${string}`;
    event: unknown;
    fromBlock: bigint;
    toBlock: bigint;
    maxRange?: bigint;
    chunkSize?: bigint;
  },
): Promise<unknown[]> {
  const { fromBlock, toBlock } = params;
  if (fromBlock > toBlock)
    throw new ProviderError("range", "Log range starts after it ends");
  const maxRange = params.maxRange ?? 10_000n;
  if (toBlock - fromBlock > maxRange)
    throw new ProviderError(
      "range",
      `Log range must be 0 to ${maxRange} blocks`,
    );
  const chunk = params.chunkSize ?? 2_000n;
  const out: unknown[] = [];
  for (let start = fromBlock; start <= toBlock; start += chunk + 1n) {
    const end = start + chunk > toBlock ? toBlock : start + chunk;
    const logs = await withRetry(() =>
      client.getLogs({
        address: params.address,
        // viem accepts a parsed ABI item; the cast keeps this module generic.
        event: params.event as never,
        fromBlock: start,
        toBlock: end,
      }),
    );
    out.push(...logs);
  }
  return out;
}

export function networkName(chainId: number) {
  return NETWORKS.find((n) => n.id === chainId)?.name ?? `chain ${chainId}`;
}
