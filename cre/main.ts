import {
  Runner,
  cre,
  consensusIdenticalAggregation,
  json,
  blockNumber,
  bytesToHex,
  prepareReportRequest,
  hexToBase64,
  TxStatus,
  type Runtime,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import { hash } from "../src/core/canonical";
const configSchema = z.object({
  schedule: z.string(),
  passportUrl: z.string().url(),
  chainSelector: z.string(),
  chainId: z.number(),
  isTestnet: z.boolean(),
  registryAddress: z.string().optional(),
  requireInference: z.boolean().default(true),
  publish: z.boolean().default(false),
});
type Config = z.infer<typeof configSchema>;
function fetchPassport(send: HTTPSendRequester, config: Config): string {
  const response = send
    .sendRequest({ url: config.passportUrl, method: "GET" })
    .result();
  if (response.statusCode !== 200)
    throw new Error("Analysis API returned HTTP " + response.statusCode);
  return JSON.stringify(json(response));
}
function orchestrate(runtime: Runtime<Config>): string {
  const raw = new cre.capabilities.HTTPClient()
    .sendRequest(
      runtime,
      fetchPassport,
      consensusIdenticalAggregation<string>(),
    )(runtime.config)
    .result();
  const data = JSON.parse(raw);
  if (data.report?.schema !== "hscan.passport.v1")
    throw new Error("Unsupported report schema");
  if (hash(data.report) !== data.reportHash)
    throw new Error("Canonical report hash mismatch");
  const s = data.report.snapshot;
  if (s.chainId !== runtime.config.chainId)
    throw new Error("Report chain does not match configured chain");
  const nodes = new Set(s.evidence.nodes.map((n: { id: string }) => n.id));
  for (const f of s.findings)
    if (
      !f.evidenceIds.length ||
      f.evidenceIds.some((id: string) => !nodes.has(id))
    )
      throw new Error("Finding references missing evidence");
  if (
    runtime.config.requireInference &&
    (!data.report.inference?.requestId ||
      data.report.inference?.status !== "complete")
  )
    throw new Error(
      "A successful 0G inference with an actual request ID is required",
    );
  const selectors = cre.capabilities.EVMClient.SUPPORTED_CHAIN_SELECTORS;
  const selector =
    selectors[runtime.config.chainSelector as keyof typeof selectors];
  if (!selector) throw new Error("Unsupported EVM chain selector");
  const evm = new cre.capabilities.EVMClient(selector);
  const observed = evm
    .headerByNumber(runtime, { blockNumber: blockNumber(s.blockNumber) })
    .result();
  runtime.log("Block-pinned EVM header read: " + s.blockNumber);
  if (!observed.header) throw new Error("Chain returned no block header");
  if (
    bytesToHex(observed.header.hash).toLowerCase() !== s.blockHash.toLowerCase()
  )
    throw new Error("Report block hash does not match the CRE EVM observation");
  const payload = encodeAbiParameters(
    parseAbiParameters("address,uint256,bytes32,bytes32,uint8"),
    [
      s.address as Address,
      BigInt(s.chainId),
      s.stateFingerprint as Hex,
      data.reportHash as Hex,
      Math.min(3, Math.floor(s.attentionScore / 25)),
    ],
  );
  const report = runtime.report(prepareReportRequest(payload)).result();
  runtime.log("Canonical report validated: " + data.reportHash);
  runtime.log(
    "0G request ID: " +
      (data.report.inference?.requestId ??
        "NOT_AVAILABLE — inference requirement disabled for independent orchestration test"),
  );
  if (runtime.config.publish) {
    if (!runtime.config.registryAddress)
      throw new Error("Registry address required for publication");
    const result = evm
      .writeReport(runtime, {
        receiver: hexToBase64(runtime.config.registryAddress),
        report,
        gasConfig: { gasLimit: "500000" },
      })
      .result();
    if (result.txStatus !== TxStatus.SUCCESS)
      throw new Error("Registry write failed");
    if (!result.txHash?.length)
      throw new Error("Publication returned no transaction evidence");
    runtime.log("Registry write hash: " + bytesToHex(result.txHash));
    return JSON.stringify({
      reportHash: data.reportHash,
      publication: "submitted",
      transactionHash: bytesToHex(result.txHash),
    });
  }
  return JSON.stringify({
    reportHash: data.reportHash,
    blockNumber: s.blockNumber,
    publication: "prepared-not-submitted",
    inferenceRequired: runtime.config.requireInference,
  });
}
function initWorkflow(config: Config) {
  return [
    cre.handler(
      new cre.capabilities.CronCapability().trigger({
        schedule: config.schedule,
      }),
      orchestrate,
    ),
  ];
}
export async function main() {
  const runner = await Runner.newRunner({ configSchema });
  await runner.run(initWorkflow);
}
main();
