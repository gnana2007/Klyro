/**
 * Deploy HookRiskRegistry to a chain you choose.
 *
 * Two modes:
 *   --local   use Anvil's public test mnemonic on chain 31337 (no value at risk)
 *   default   use DEPLOYER_PRIVATE_KEY for a real testnet (Sepolia / Base)
 *
 * This script is for reproducible deployments from CI or a terminal. The app's
 * own operator page does the same thing through a browser wallet without ever
 * putting a key on the server. Prefer the app unless you need automation.
 *
 *   npm run deploy:registry -- --chain 11155111
 *   npm run deploy:registry -- --chain 31337 --local
 *
 * Refuses mainnet unless --i-understand-mainnet is passed, and never prints the
 * key. Writes a record only from an actual receipt.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeDeployData,
  type Hex,
} from "viem";
import { sepolia, base, foundry, mainnet } from "viem/chains";
import type { Chain } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const chainId = Number(get("--chain") || "0");
const local = args.includes("--local");
const mainnetOk = args.includes("--i-understand-mainnet");

const CHAINS: Record<number, { chain: Chain; env: string; fallback: string }> = {
  11155111: { chain: sepolia, env: "RPC_SEPOLIA", fallback: "https://ethereum-sepolia-rpc.publicnode.com" },
  8453: { chain: base, env: "RPC_BASE", fallback: "https://base-rpc.publicnode.com" },
  31337: { chain: foundry, env: "RPC_LOCAL", fallback: "http://127.0.0.1:8545" },
  1: { chain: mainnet, env: "RPC_ETHEREUM", fallback: "https://ethereum-rpc.publicnode.com" },
};

async function main() {
  const target = CHAINS[chainId];
  if (!target)
    throw new Error(
      "Pass --chain with one of: 11155111 (Sepolia), 8453 (Base), 31337 (Anvil)",
    );
  if (chainId === 1 && !mainnetOk)
    throw new Error(
      "Refusing Ethereum mainnet. Add --i-understand-mainnet only when that is the deliberate decision.",
    );

  let account;
  if (local || chainId === 31337) {
    // Foundry's published test mnemonic. Only valid because the chain is local.
    account = mnemonicToAccount(
      "test test test test test test test test test test test junk",
    );
  } else {
    const key = process.env.DEPLOYER_PRIVATE_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
      throw new Error(
        "Set DEPLOYER_PRIVATE_KEY (0x + 64 hex characters) for a real network. It is read from the environment only and never printed.",
      );
    account = privateKeyToAccount(key as Hex);
  }

  const transport = http(process.env[target.env] || target.fallback, {
    timeout: 20000,
  });
  const client = createPublicClient({ chain: target.chain, transport });
  const wallet = createWalletClient({ account, chain: target.chain, transport });

  const observed = await client.getChainId();
  if (observed !== chainId)
    throw new Error(
      "The configured RPC reports chain " + observed + ", not " + chainId,
    );

  const artifact = JSON.parse(
    readFileSync("contracts/out/HookRiskRegistry.sol/HookRiskRegistry.json", "utf8"),
  ) as { abi: unknown[]; bytecode: { object: Hex } };
  if (!artifact.bytecode?.object || artifact.bytecode.object === "0x")
    throw new Error("Run npm run contracts:build first");

  const owner = get("--owner") || account.address;
  console.log("chain     ", chainId, target.chain.name);
  console.log("deployer  ", account.address);
  console.log("owner     ", owner);

  const balance = await client.getBalance({ address: account.address });
  console.log("balance   ", balance.toString(), "wei");
  if (balance === 0n && chainId !== 31337)
    throw new Error(
      "The deployer has no balance on this chain. Fund it from a faucet first; this script never buys anything.",
    );

  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [owner as `0x${string}`],
  });
  const gas = await client.estimateGas({ account: account.address, data });
  const gasPrice = await client.getGasPrice();
  console.log("gas est.  ", gas.toString(), "at", gasPrice.toString(), "wei =", (gas * gasPrice).toString(), "wei");

  const txHash = await wallet.sendTransaction({ data });
  console.log("sent      ", txHash);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  console.log("status    ", receipt.status, "block", receipt.blockNumber.toString(), "gas", receipt.gasUsed.toString());
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw new Error("Deployment did not succeed; no address to report.");

  const code = await client.getCode({ address: receipt.contractAddress });
  const storedOwner = (await client.readContract({
    address: receipt.contractAddress,
    abi: artifact.abi as never,
    functionName: "owner",
  })) as string;
  console.log("address   ", receipt.contractAddress);
  console.log("code size ", (code ? (code.length - 2) / 2 : 0), "bytes");
  console.log("owner()   ", storedOwner, storedOwner.toLowerCase() === owner.toLowerCase() ? "(matches)" : "(MISMATCH)");

  mkdirSync("evidence", { recursive: true });
  const record = {
    scope: chainId === 31337 ? "LOCAL_ANVIL_ONLY" : "PUBLIC_CHAIN_TESTNET",
    chainId,
    chainName: target.chain.name,
    address: receipt.contractAddress,
    transactionHash: txHash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    deployer: account.address,
    owner,
    ownerMatches: storedOwner.toLowerCase() === owner.toLowerCase(),
    codeSize: code ? (code.length - 2) / 2 : 0,
    deployedAt: new Date().toISOString(),
    nextSteps: [
      "Set REGISTRY_ADDRESS and REGISTRY_CHAIN_ID in the server environment.",
      "Authorize the CRE forwarder with setForwarder(address) as the owner.",
      "Authorize the workflow id with setWorkflow(bytes32,bool) before CRE publication.",
      "Verify the source on the block explorer if you want public readability.",
    ],
  };
  writeFileSync("evidence/registry-deployment.json", JSON.stringify(record, null, 2));
  console.log("wrote     evidence/registry-deployment.json");
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
