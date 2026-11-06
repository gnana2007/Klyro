import { readFileSync, writeFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { foundry } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import { scanHook } from "../src/server/scan";
import { compareSnapshots } from "../src/core/diff";
const artifact = (name: string) =>
  JSON.parse(
    readFileSync("contracts/out/ProxyFixture.sol/" + name + ".json", "utf8"),
  );
async function main() {
  const client = createPublicClient({
    chain: foundry,
    transport: http("http://127.0.0.1:8545"),
  });
  assert.equal(await client.getChainId(), 31337);
  const wallet = createWalletClient({
    account: mnemonicToAccount(
      "test test test test test test test test test test test junk",
    ),
    chain: foundry,
    transport: http("http://127.0.0.1:8545"),
  });
  async function deploy(name: string, args: unknown[] = []) {
    const a = artifact(name);
    const tx = await wallet.deployContract({
      abi: a.abi,
      bytecode: a.bytecode.object,
      args,
    });
    const r = await client.waitForTransactionReceipt({ hash: tx });
    assert.equal(r.status, "success");
    return r.contractAddress as Address;
  }
  const first = await deploy("RevisionOne"),
    second = await deploy("RevisionTwo"),
    proxy = await deploy("ProxyFixture", [first]);
  const before = await scanHook({ chainId: 31337, address: proxy });
  const tx = await wallet.writeContract({
    address: proxy,
    abi: artifact("ProxyFixture").abi,
    functionName: "upgradeTo",
    args: [second],
  });
  await client.waitForTransactionReceipt({ hash: tx });
  const after = await scanHook({ chainId: 31337, address: proxy });
  const diff = compareSnapshots(before, after);
  assert.equal(before.runtimeHash, after.runtimeHash);
  assert.notEqual(
    before.proxy.implementationHash,
    after.proxy.implementationHash,
  );
  assert.equal(
    diff.changes.find((c) => c.field === "proxy.implementation")?.status,
    "changed",
  );
  const result = {
    scope: "LOCAL_PROXY_RESOLUTION_FIXTURE_NOT_A_CONFIRMED_HOOK",
    timestamp: new Date().toISOString(),
    proxy,
    upgradeTransaction: tx,
    before,
    after,
    diff,
  };
  writeFileSync("evidence/proxy-upgrade.json", JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        proxy,
        upgradeTransaction: tx,
        unchangedRuntimeHash: before.runtimeHash,
        previousImplementation: first,
        currentImplementation: second,
        implementationChangeDetected: true,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
