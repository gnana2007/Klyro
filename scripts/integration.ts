import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { foundry } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import { hash } from "../src/core/canonical";
const origin = "http://127.0.0.1:3000";
async function api(path: string, data?: unknown) {
  const response = await fetch(origin + "/api/" + path, {
    ...(data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {}),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(path + ": " + json.error);
  return json;
}
async function scan(address: string) {
  const { id } = await api("scans", { address, chainId: 31337, explain: true });
  for (let i = 0; i < 120; i++) {
    const job = await api("scans/" + id);
    if (job.status === "failed") throw new Error(job.error);
    if (job.status === "complete") return job;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Scan timed out");
}
async function main() {
  const fixture = await api("fixture");
  const first = await scan(fixture.hook),
    second = await scan(fixture.hook);
  assert.equal(first.snapshot.runtimeHash, second.snapshot.runtimeHash);
  assert.equal(first.snapshot.compatibility, "POOL_OBSERVED");
  assert.equal(first.inference.status, "unavailable");
  const diff = await api("diffs", {
    previousId: first.id,
    currentId: second.id,
  });
  assert.equal(
    diff.changes.find((c: { field: string }) => c.field === "runtimeHash")
      .status,
    "unchanged",
  );
  const passport = await api("passports", { scanId: second.id });
  assert.equal(hash(passport.report), passport.reportHash);
  const verification = await api("verify/" + passport.report.id);
  assert.equal(verification.integrity, "MATCH");
  assert.equal(verification.authenticity, "INTEGRITY_ONLY");
  const tampered = structuredClone(passport.report);
  tampered.snapshot.codeSize++;
  const changed = await api("verify/" + passport.report.id, {
    report: tampered,
  });
  assert.equal(changed.integrity, "MODIFIED");
  const client = createPublicClient({
    chain: foundry,
    transport: http("http://127.0.0.1:8545"),
  });
  assert.equal(await client.getChainId(), 31337);
  const account = mnemonicToAccount(
    "test test test test test test test test test test test junk",
  );
  const wallet = createWalletClient({
    account,
    chain: foundry,
    transport: http("http://127.0.0.1:8545"),
  });
  const contract = JSON.parse(
    readFileSync(
      "contracts/out/HookRiskRegistry.sol/HookRiskRegistry.json",
      "utf8",
    ),
  );
  const tx = await wallet.writeContract({
    address: fixture.registry,
    abi: contract.abi,
    functionName: "publish",
    args: [
      fixture.hook,
      31337n,
      passport.report.snapshot.stateFingerprint as Hex,
      passport.reportHash as Hex,
      1,
    ],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  assert.equal(receipt.status, "success");
  const record = (await client.readContract({
    address: fixture.registry,
    abi: contract.abi,
    functionName: "publications",
    args: [passport.reportHash],
  })) as unknown[];
  assert.equal(record[3], passport.reportHash);
  const evidence = {
    timestamp: new Date().toISOString(),
    scope: "LOCAL_ANVIL_INTEGRATION",
    checks: [
      "real deployed hook scan",
      "PoolManager Initialize association",
      "persistent rescan history",
      "deterministic unchanged diff",
      "honest unavailable 0G state",
      "canonical passport hash",
      "tamper rejection",
      "actual local registry publication and readback",
    ],
    firstScanId: first.id,
    secondScanId: second.id,
    passportId: passport.report.id,
    reportHash: passport.reportHash,
    registry: fixture.registry,
    registryTransaction: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    currentFingerprint: first.snapshot.stateFingerprint,
    uiUrl: origin + "/?scan=" + second.id,
    passportUrl: origin + "/passport/" + passport.report.id,
  };
  mkdirSync("evidence", { recursive: true });
  writeFileSync("evidence/integration.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
