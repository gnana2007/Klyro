import { parseAbiItem, zeroAddress, type Address } from "viem";
import { clientFor, NETWORKS } from "./chains";

const initialized = parseAbiItem("event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)");

/** Bounded, read-only discovery. A result means PoolManager emitted Initialize,
 * not that the hook is safe or that every earlier pool has been indexed. */
export async function discoverSepoliaHooks(windowBlocks = 2000) {
  const client = clientFor(11155111);
  // Leave a small head buffer: load-balanced public RPC backends may disagree
  // about the newest block by one or two blocks during propagation.
  const head = await client.getBlockNumber();
  const latest = head > 6n ? head - 6n : 0n;
  const manager = NETWORKS.find((network) => network.id === 11155111)!.manager as Address;
  const first = latest > BigInt(windowBlocks) ? latest - BigInt(windowBlocks) + 1n : 0n;
  const found = new Map<string, { address: Address; firstSeenBlock: string; lastSeenBlock: string; pools: number }>();
  // Public RPCs often cap getLogs ranges. Keep requests bounded and serial.
  for (let from = first; from <= latest; from += 200n) {
    const to = from + 199n < latest ? from + 199n : latest;
    const logs = await client.getLogs({ address: manager, event: initialized, fromBlock: from, toBlock: to });
    for (const log of logs) {
      const hook = log.args.hooks;
      if (!hook || hook === zeroAddress) continue;
      const key = hook.toLowerCase();
      const prior = found.get(key);
      found.set(key, {
        address: hook,
        firstSeenBlock: prior?.firstSeenBlock ?? log.blockNumber.toString(),
        lastSeenBlock: log.blockNumber.toString(),
        pools: (prior?.pools ?? 0) + 1,
      });
    }
  }
  return {
    chainId: 11155111,
    fromBlock: first.toString(),
    toBlock: latest.toString(),
    hooks: [...found.values()].sort((a, b) => Number(BigInt(b.lastSeenBlock) - BigInt(a.lastSeenBlock))),
    notice: "Only PoolManager Initialize events in this bounded Sepolia block window are shown. An empty result does not mean no hooks exist. Monitoring begins when you add a discovered address; it is interval-based and missed periods are not backfilled.",
  };
}
