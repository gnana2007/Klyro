import { mkdirSync, writeFileSync } from "node:fs";
import { parseAbiItem, zeroAddress } from "viem";
import { clientFor, NETWORKS } from "../src/server/chains";
import { scanHook } from "../src/server/scan";
async function main() {
  const client = clientFor(1);
  const latest = await client.getBlockNumber();
  const manager = NETWORKS[0].manager;
  const logs = await client.getLogs({
    address: manager,
    event: parseAbiItem(
      "event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)",
    ),
    fromBlock: latest - 2000n,
    toBlock: latest,
  });
  const match = logs
    .toReversed()
    .find((l) => l.args.hooks && l.args.hooks !== zeroAddress);
  if (!match?.args.hooks)
    throw new Error("No nonzero hook found in the bounded live event window");
  const s = await scanHook(
    {
      chainId: 1,
      address: match.args.hooks,
      poolFromBlock: (latest - 2000n).toString(),
    },
    console.error,
  );
  mkdirSync("evidence", { recursive: true });
  writeFileSync("evidence/live-hook-scan.json", JSON.stringify(s, null, 2));
  console.log(
    JSON.stringify(
      {
        address: s.address,
        chainId: s.chainId,
        blockNumber: s.blockNumber,
        blockHash: s.blockHash,
        runtimeHash: s.runtimeHash,
        compatibility: s.compatibility,
        pools: s.poolContext.pools.length,
        findings: s.findings.length,
        sourceStatus: s.source.status,
        proxy: s.proxy.kind,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
