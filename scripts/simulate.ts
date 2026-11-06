import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeDeployData,
  getCreate2Address,
  keccak256,
  toHex,
  parseEventLogs,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { saveExecution } from "../src/server/db";
const ROOT = process.cwd();
const client = createPublicClient({
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});
const artifact = (file: string, name: string) =>
  JSON.parse(
    readFileSync(
      resolve("contracts/out", file + ".sol", name + ".json"),
      "utf8",
    ),
  );
async function main() {
  const build = spawnSync(process.execPath, ["scripts/foundry.mjs", "build"], {
    stdio: "inherit",
  });
  if (build.status !== 0) throw new Error("Foundry build failed");
  let running = false;
  try {
    running = (await client.getChainId()) === 31337;
  } catch {}
  if (!running) {
    const p =
      process.platform === "win32"
        ? "win32-amd64"
        : `${process.platform}-${process.arch === "x64" ? "amd64" : "arm64"}`;
    const binary = resolve(
      `node_modules/@foundry-rs/anvil-${p}/bin/anvil${process.platform === "win32" ? ".exe" : ""}`,
    );
    const child = spawn(
      binary,
      [
        "--host",
        "127.0.0.1",
        "--port",
        "8545",
        "--chain-id",
        "31337",
        "--disable-code-size-limit",
        "--gas-limit",
        "500000000",
        "--silent",
      ],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    mkdirSync("data", { recursive: true });
    writeFileSync("data/anvil.pid", String(child.pid));
    for (let i = 0; i < 40; i++) {
      try {
        if ((await client.getChainId()) === 31337) {
          running = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!running) throw new Error("Anvil did not start");
  }
  if ((await client.getChainId()) !== 31337)
    throw new Error("This runner refuses all non-local chains");
  // Public Anvil development mnemonic. Never accepted for a remote chain or production publication.
  const account = mnemonicToAccount(
    "test test test test test test test test test test test junk",
  );
  const wallet = createWalletClient({
    account,
    chain: foundry,
    transport: http("http://127.0.0.1:8545"),
  });
  const a = artifact("LocalScenario", "LocalScenario");
  const tx = await wallet.deployContract({
    abi: a.abi,
    bytecode: a.bytecode.object as Hex,
    gas: 150000000n,
  });
  const deployed = await client.waitForTransactionReceipt({ hash: tx });
  if (deployed.status !== "success" || !deployed.contractAddress)
    throw new Error("Fixture deployment reverted");
  const harness = deployed.contractAddress;
  const read = async (name: string) =>
    client.readContract({
      address: harness,
      abi: a.abi,
      functionName: name,
    }) as Promise<Address>;
  const manager = await read("manager");
  const h = artifact("LocalScenario", "ObservedFeeHook");
  const init = encodeDeployData({
    abi: h.abi,
    bytecode: h.bytecode.object as Hex,
    args: [manager],
  });
  let salt: Hex = toHex(0, { size: 32 }),
    hook: Address = harness;
  for (let i = 0; i < 500000; i++) {
    salt = toHex(i, { size: 32 });
    hook = getCreate2Address({
      from: harness,
      salt,
      bytecodeHash: keccak256(init),
    });
    if ((BigInt(hook) & 16383n) === 196n) break;
    if (i === 499999) throw new Error("Salt search exhausted");
  }
  async function send(name: string, args: unknown[] = []) {
    const tx = await wallet.writeContract({
      address: harness,
      abi: a.abi,
      functionName: name,
      args,
      gas: 100000000n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") throw new Error(name + " reverted");
    return receipt;
  }
  await send("installHook", [salt]);
  await send("prepare");
  const baseline = await send("execute", [false]);
  const hooked = await send("execute", [true]);
  const events = parseAbi([
    "event SwapObserved(bool hooked,uint256 inputAmount,uint256 outputAmount,uint256 balance0Before,uint256 balance0After,uint256 balance1Before,uint256 balance1After,int128 delta0,int128 delta1,uint256 gasUsed)",
  ]);
  const baselineEvent = parseEventLogs({
    abi: events,
    logs: baseline.logs,
    eventName: "SwapObserved",
  })[0];
  const hookEvent = parseEventLogs({
    abi: events,
    logs: hooked.logs,
    eventName: "SwapObserved",
  })[0];
  const fee = (await client.readContract({
    address: hook,
    abi: h.abi,
    functionName: "totalFee",
  })) as bigint;
  const callsBefore = await client.readContract({
    address: hook,
    abi: h.abi,
    functionName: "beforeCalls",
  });
  const callsAfter = await client.readContract({
    address: hook,
    abi: h.abi,
    functionName: "afterCalls",
  });
  const registryArtifact = artifact("HookRiskRegistry", "HookRiskRegistry");
  const regTx = await wallet.deployContract({
    abi: registryArtifact.abi,
    bytecode: registryArtifact.bytecode.object,
    args: [account.address],
  });
  const regReceipt = await client.waitForTransactionReceipt({ hash: regTx });
  const result = {
    scenarioId: "uniswap-v4-baseline-vs-observed-fee-v1",
    scope: "LOCAL_FIXTURE_ONLY",
    chainId: 31337,
    timestamp: new Date().toISOString(),
    harness,
    hook,
    manager,
    token0: await read("token0"),
    token1: await read("token1"),
    registry: regReceipt.contractAddress,
    deploymentTransaction: tx,
    baseline: {
      transaction: baseline.transactionHash,
      block: baseline.blockNumber,
      gasUsed: baseline.gasUsed,
      observed: baselineEvent.args,
    },
    hooked: {
      transaction: hooked.transactionHash,
      block: hooked.blockNumber,
      gasUsed: hooked.gasUsed,
      observed: hookEvent.args,
    },
    fee,
    beforeCalls: callsBefore,
    afterCalls: callsAfter,
    revertReason: null,
    limitations: [
      "Controlled local test contract; not arbitrary production hook execution.",
      "One exact-input zero-for-one scenario and one-percent output charge.",
      "Identical initial pool liquidity and price, not identical block timestamps.",
    ],
  };
  const serialized = JSON.stringify(
    result,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
  mkdirSync("evidence", { recursive: true });
  writeFileSync("evidence/local-simulation.json", serialized);
  writeFileSync("data/fixture.json", serialized);
  saveExecution(
    "local-simulation-" + Date.now(),
    "simulation",
    JSON.parse(serialized),
  );
  console.log(serialized);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
