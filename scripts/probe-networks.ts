// Read-only reachability probe for the configured chains. Uses no funds and
// signs nothing; it only reads chain id and head block.
import { createPublicClient, http } from "viem";
import { mainnet, sepolia, base, foundry } from "viem/chains";

const targets = [
  { name: "Ethereum", chain: mainnet, url: process.env.RPC_ETHEREUM || "https://ethereum-rpc.publicnode.com" },
  { name: "Sepolia", chain: sepolia, url: process.env.RPC_SEPOLIA || "https://ethereum-sepolia-rpc.publicnode.com" },
  { name: "Base", chain: base, url: process.env.RPC_BASE || "https://base-rpc.publicnode.com" },
  { name: "Anvil", chain: foundry, url: process.env.RPC_LOCAL || "http://127.0.0.1:8545" },
];

async function main() {
for (const t of targets) {
  try {
    const client = createPublicClient({ chain: t.chain, transport: http(t.url, { timeout: 15000 }) });
    const [chainId, block] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    console.log(`${t.name}: chainId=${chainId} head=${block}`);
  } catch (error) {
    console.log(`${t.name}: unavailable (${(error as Error).name})`);
  }
}
}
main();
