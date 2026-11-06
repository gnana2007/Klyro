import { createPublicClient, http } from "viem";
import { mainnet, sepolia, base, foundry } from "viem/chains";
import { networkFetch } from "./network";
export const NETWORKS = [
  {
    id: 1,
    name: "Ethereum",
    env: "RPC_ETHEREUM",
    url: "https://ethereum-rpc.publicnode.com",
    chain: mainnet,
    manager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
  },
  {
    id: 11155111,
    name: "Sepolia",
    env: "RPC_SEPOLIA",
    url: "https://ethereum-sepolia-rpc.publicnode.com",
    chain: sepolia,
    manager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
  },
  {
    id: 8453,
    name: "Base",
    env: "RPC_BASE",
    url: "https://base-rpc.publicnode.com",
    chain: base,
    manager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
  },
  {
    id: 31337,
    name: "Local Anvil",
    env: "RPC_LOCAL",
    url: "http://127.0.0.1:8545",
    chain: foundry,
    manager: null,
  },
] as const;
export function clientFor(chainId: number) {
  const n = NETWORKS.find((n) => n.id === chainId);
  if (!n) throw new Error("Unsupported chain");
  return createPublicClient({
    chain: n.chain,
    transport: http(process.env[n.env] || n.url, {
      timeout: 15000,
      retryCount: 1,
      fetchFn: networkFetch,
    }),
  });
}
