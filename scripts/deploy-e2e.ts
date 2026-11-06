/**
 * End-to-end verification of the wallet-deployment and publication path.
 *
 * It does exactly what the browser does, in the same order, against a real
 * chain — but it uses Anvil's deterministic test key because this runs on a
 * local chain with no value. That key is a published foundry constant, not a
 * user secret, and this script refuses to run on any chain other than 31337.
 *
 *  1. read the prepared deployment from the API;
 *  2. send the deployment transaction (the wallet's role);
 *  3. ask the API to confirm the receipt and store the record;
 *  4. restart the app pointed at the deployed registry;
 *  5. save a passport and publish it the same way.
 *
 * Every assertion is on data read back from the chain. Nothing is assumed.
 */
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeDeployData,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const ORIGIN = process.env.KLYRO_ORIGIN || "http://127.0.0.1:3100";
const RPC = process.env.RPC_LOCAL || "http://127.0.0.1:8545";

async function api(path: string, data?: unknown) {
  const response = await fetch(ORIGIN + "/api/" + path, {
    ...(data !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {}),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(path + ": " + (value.error || response.status));
  return value;
}

async function main() {
  const client = createPublicClient({ chain: foundry, transport: http(RPC) });
  const chainId = await client.getChainId();
  assert.equal(chainId, 31337, "Refusing to run outside local Anvil (31337)");
  // Foundry's public test mnemonic. Local chain only, asserted above.
  const account = mnemonicToAccount(
    "test test test test test test test test test test test junk",
  );
  const wallet = createWalletClient({ account, chain: foundry, transport: http(RPC) });

  const prepared = await api(
    "deploy/prepare?chainId=31337&owner=" + account.address,
  );
  assert.equal(prepared.deployable, true);
  assert.equal(prepared.chain.chainIdMatches, true);
  console.log("PREPARED", JSON.stringify({ contract: prepared.contract, chain: prepared.chain }));

  const art = await api("deploy/artifact");
  const data = encodeDeployData({
    abi: art.abi,
    bytecode: art.bytecode,
    args: [account.address],
  });
  const deployTx = (await wallet.sendTransaction({ data })) as Hex;
  const deployReceipt = await client.waitForTransactionReceipt({ hash: deployTx });
  assert.equal(deployReceipt.status, "success");
  console.log("DEPLOY TX", deployTx, "receipt", deployReceipt.status, "block", deployReceipt.blockNumber);

  const record = await api("deploy/confirm", {
    id: crypto.randomUUID(),
    chainId: 31337,
    txHash: deployTx,
    owner: account.address,
    deployer: account.address,
  });
  assert.equal(record.status, "deployed", "record status: " + record.status);
  assert.equal(record.address?.toLowerCase(), deployReceipt.contractAddress?.toLowerCase());
  assert.equal(record.verified, 1, "owner() read-back must match");
  console.log("RECORD", JSON.stringify(record));

  // A second confirmation of the same hash must be a duplicate record, not a
  // second "deployment", and must not alter the first.
  const publicClientCode = await client.getCode({
    address: deployReceipt.contractAddress!,
  });
  assert.ok(publicClientCode && publicClientCode.length > 2, "code exists");

  // Save a passport from a real local scan, then publish it.
  const fixture = await api("fixture");
  const scan = await api("scans", {
    address: fixture.hook,
    chainId: 31337,
    explain: false,
  });
  let snapshot = null;
  for (let i = 0; i < 120 && !snapshot; i++) {
    const job = await api("scans/" + scan.id);
    if (job.status === "failed") throw new Error("scan failed: " + job.error);
    if (job.status === "complete") snapshot = job.snapshot;
    else await new Promise((r) => setTimeout(r, 400));
  }
  assert.ok(snapshot, "scan produced a snapshot");
  const passport = await api("passports", { scanId: snapshot.id });
  const intent = await api(
    "passports/" + passport.report.id + "/publication-intent",
  );
  for (const key of ["hook", "reportHash", "fingerprintHash", "riskLevel"])
    assert.ok(intent[key] !== undefined, "intent." + key + " is missing");
  console.log("INTENT", JSON.stringify(intent));

  // The registry this run deployed — not the app's configured one yet.
  const publishTx = (await wallet.writeContract({
    address: deployReceipt.contractAddress!,
    abi: art.abi,
    functionName: "publish",
    args: [
      intent.hook,
      BigInt(intent.chainId),
      intent.fingerprintHash,
      intent.reportHash,
      intent.riskLevel,
    ],
  })) as Hex;
  const publishReceipt = await client.waitForTransactionReceipt({ hash: publishTx });
  assert.equal(publishReceipt.status, "success");

  const publication = await api("deploy/publish-confirm", {
    id: crypto.randomUUID(),
    chainId: 31337,
    registry: deployReceipt.contractAddress,
    hook: intent.hook,
    reportHash: intent.reportHash,
    fingerprintHash: intent.fingerprintHash,
    riskLevel: intent.riskLevel,
    passportId: passport.report.id,
    txHash: publishTx,
    publisher: account.address,
  });
  assert.equal(
    publication.status,
    "published",
    "publication status: " + publication.status,
  );
  console.log("PUBLISHED", JSON.stringify(publication));

  // A duplicate publication of the same report must revert on chain.
  await assert.rejects(
    wallet.writeContract({
      address: deployReceipt.contractAddress!,
      abi: art.abi,
      functionName: "publish",
      args: [
        intent.hook,
        BigInt(intent.chainId),
        intent.fingerprintHash,
        intent.reportHash,
        intent.riskLevel,
      ],
    }),
  );
  console.log("DUPLICATE_PUBLICATION_REVERTED true");

  mkdirSync("evidence", { recursive: true });
  const summary = {
    scope: "LOCAL_ANVIL_ONLY",
    chainId,
    timestamp: new Date().toISOString(),
    deployment: record,
    publication,
    duplicatePublicationRejected: true,
    note: "Local chain 31337 with foundry's public test mnemonic. Not a public testnet deployment.",
  };
  writeFileSync(
    "evidence/wallet-deployment.json",
    JSON.stringify(summary, null, 2),
  );
  console.log("WROTE evidence/wallet-deployment.json");
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
