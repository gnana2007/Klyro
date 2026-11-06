import { randomUUID } from "node:crypto";
import {
  getAddress,
  keccak256,
  parseAbi,
  parseAbiItem,
  type Address,
} from "viem";
import {
  decodePermissions,
  validPermissionDependencies,
} from "../core/permissions";
import { ANALYSIS_VERSION, fingerprints } from "../core/canonical";
import {
  analyze,
  inspectOpcodes,
  makeNode,
  assertEvidence,
} from "../core/analysis";
import type { Snapshot } from "../core/types";
import { clientFor, NETWORKS } from "./chains";
import { resolveProxy } from "./proxy";
import { verifiedSource } from "./source";
import { readFileSync } from "node:fs";
import { executions } from "./db";
export type ScanInput = {
  chainId: number;
  address: string;
  blockNumber?: string;
  poolFromBlock?: string;
};
const initialize = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
);
export async function scanHook(
  input: ScanInput,
  onStage: (s: string) => void = () => {},
): Promise<Snapshot> {
  const address = getAddress(input.address);
  const client = clientFor(input.chainId);
  onStage("Connecting to chain");
  if ((await client.getChainId()) !== input.chainId)
    throw new Error("RPC chain ID mismatch");
  const block = await client.getBlock(
    input.blockNumber
      ? { blockNumber: BigInt(input.blockNumber) }
      : { blockTag: "latest" },
  );
  if (block.number === null || !block.hash)
    throw new Error("Pending block cannot anchor a report");
  const blockNumber = block.number;
  onStage("Retrieving block-pinned bytecode");
  const code = await client.getCode({ address, blockNumber });
  if (!code || code === "0x")
    throw new Error("No deployed code at this address and block");
  onStage("Resolving implementation and ownership");
  const [proxy, ownerRead] = await Promise.all([
    resolveProxy(client, address, code, blockNumber),
    client
      .readContract({
        address,
        abi: parseAbi(["function owner() view returns (address)"]),
        functionName: "owner",
        blockNumber,
      })
      .catch(() => null),
  ]);
  const permissions = decodePermissions(address);
  const permissionBitmap = Number(BigInt(address) & 16383n);
  const ops = inspectOpcodes(code);
  const limitations = [
    "This is a bounded security investigation, not a full audit or safety certification.",
    "Only recognized proxy patterns and selected state are inspected.",
    "Static opcode/address candidates do not prove executed calls.",
    "Current code matching cannot establish equivalence of all runtime behavior.",
  ];
  onStage("Checking verified source against observed code");
  const source = await verifiedSource(
    input.chainId,
    proxy.implementation ?? address,
    proxy.implementationHash ?? keccak256(code),
  );
  if (source.status === "VERIFIED")
    limitations.push(
      "Source verification is Sourcify-reported with matching observed runtime; a local compiler reproduction was not performed.",
    );
  let manager: string | null =
    NETWORKS.find((n) => n.id === input.chainId)?.manager ?? null;
  if (input.chainId === 31337) {
    try {
      const fixture = JSON.parse(
        readFileSync(process.cwd() + "/data/fixture.json", "utf8"),
      );
      manager = fixture.manager;
    } catch {}
  }
  const pools: Record<string, unknown>[] = [];
  let poolStatus: Snapshot["poolContext"]["status"] = "UNKNOWN";
  if (manager) {
    onStage("Checking bounded PoolManager event context");
    try {
      const from = input.poolFromBlock
        ? BigInt(input.poolFromBlock)
        : blockNumber > 2000n
          ? blockNumber - 2000n
          : 0n;
      if (from > blockNumber || blockNumber - from > 10000n)
        throw new Error("Pool lookup range must be 0 to 10000 blocks");
      const logs = await client.getLogs({
        address: manager as Address,
        event: initialize,
        fromBlock: from,
        toBlock: blockNumber,
      });
      for (const log of logs)
        if (log.args.hooks?.toLowerCase() === address.toLowerCase())
          pools.push({
            ...log.args,
            sqrtPriceX96: log.args.sqrtPriceX96?.toString() ?? null,
            blockNumber: log.blockNumber?.toString() ?? null,
            transactionHash: log.transactionHash,
          });
      if (pools.length) poolStatus = "OBSERVED";
      else
        limitations.push(
          "No matching initialization in the bounded event window; older pools may exist.",
        );
    } catch {
      limitations.push(
        "Pool association lookup unavailable; hook compatibility remains unconfirmed.",
      );
    }
  }
  const s: Snapshot = {
    schema: "hscan.snapshot.v1",
    id: randomUUID(),
    chainId: input.chainId,
    address,
    blockNumber: blockNumber.toString(),
    blockHash: block.hash,
    blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    scannedAt: new Date().toISOString(),
    runtimeHash: keccak256(code),
    codeSize: (code.length - 2) / 2,
    permissions,
    permissionBitmap,
    permissionValid: validPermissionDependencies(permissions),
    compatibility: !validPermissionDependencies(permissions)
      ? "INVALID"
      : pools.length
        ? "POOL_OBSERVED"
        : "UNKNOWN",
    proxy,
    owner: ownerRead,
    source,
    dependencies: ops.candidates,
    poolContext: { manager, pools, status: poolStatus },
    findings: [],
    evidence: { nodes: [], edges: [] },
    attentionScore: 0,
    stateFingerprint: "",
    observationFingerprint: "",
    analysisVersion: ANALYSIS_VERSION,
    limitations,
  };
  const node = (
    ...args: Parameters<typeof makeNode> extends [unknown, ...infer R]
      ? R
      : never
  ) => makeNode(s, ...args);
  s.evidence.nodes = [
    node("hook", "Hook", address, { address }),
    node(
      "bytecode",
      "Contract",
      "Runtime bytecode",
      {
        hash: s.runtimeHash,
        codeSize: s.codeSize,
        callOpcodes: ops.callOpcodes,
        push20Candidates: ops.candidates,
      },
      "OBSERVED",
    ),
    node("permissions", "Code observation", "Uniswap permission bitmap", {
      bitmap: permissionBitmap,
      valid: s.permissionValid,
    }),
    node(
      "proxy",
      "Code observation",
      "Proxy resolution",
      { ...proxy },
      proxy.resolved ? "OBSERVED" : "UNKNOWN",
    ),
    node(
      "owner",
      "Admin mechanism",
      "Ownership observation",
      { address: ownerRead },
      ownerRead ? "OBSERVED" : "UNKNOWN",
      "owner() getter",
      ["A getter is not proof of access control."],
    ),
    node(
      "source",
      "Code observation",
      "Source verification",
      {
        status: source.status,
        url: source.url,
        files: source.files.map((f) => f.name),
        target: proxy.implementation ?? address,
      },
      source.status === "VERIFIED" ? "OBSERVED" : "UNKNOWN",
      "Sourcify v2 runtime-hash match",
      ["Sourcify verification is not a safety judgment."],
    ),
    node(
      "pool",
      "Code observation",
      "Pool association",
      { manager, pools },
      poolStatus,
    ),
  ];
  for (const p of permissions) {
    s.evidence.nodes.push(
      node("permission:" + p.name, "Permission", p.name, {
        enabled: p.enabled,
        bit: p.bit,
        description: p.description,
      }),
    );
    s.evidence.edges.push({
      from: "hook",
      to: "permission:" + p.name,
      type: "HAS_PERMISSION",
    });
    if (p.enabled) {
      s.evidence.nodes.push(
        node(
          "callback:" + p.name,
          "Callback",
          p.name,
          { implementation: "UNKNOWN" },
          "UNKNOWN",
          "Address permission only",
        ),
      );
      s.evidence.edges.push({
        from: "permission:" + p.name,
        to: "callback:" + p.name,
        type: "ENABLES_CALLBACK",
      });
    }
  }
  if (ownerRead)
    s.evidence.edges.push({ from: "hook", to: "owner", type: "CONTROLLED_BY" });
  for (const p of permissions.filter((p) => p.enabled)) {
    const callback = p.name.replace("ReturnDelta", "");
    for (const file of source.files) {
      const lines = file.content.split("\n");
      const line = lines.findIndex((l) =>
        new RegExp("function\\s+" + callback + "\\s*\\(").test(l),
      );
      if (line < 0) continue;
      const id = "code:" + p.name + ":" + s.evidence.nodes.length;
      s.evidence.nodes.push(
        node(
          id,
          "Code observation",
          file.name + ":" + (line + 1),
          {
            file: file.name,
            line: line + 1,
            snippet: lines.slice(line, line + 24).join("\n"),
          },
          "ESTIMATED",
          "Verified source function-name match",
          [
            "May be an interface or inherited definition; execution reachability is not proven.",
          ],
        ),
      );
      s.evidence.edges.push({
        from: "callback:" + p.name,
        to: id,
        type: "IMPLEMENTS_CALLBACK",
      });
      break;
    }
  }
  Object.assign(s, fingerprints({ ...s, config: { owner: ownerRead } }));
  onStage("Applying deterministic rules and validating evidence");
  // Detect a reorg during the scan before persisting cross-request observations.
  const confirm = await client.getBlock({ blockNumber });
  if (confirm.hash !== block.hash)
    throw new Error(
      "Chain reorganized during scan; retry at a finalized block",
    );
  const result = analyze(s);
  if (input.chainId === 31337) {
    const simulation = executions("simulation").find(
      (r) =>
        r.hook?.toLowerCase() === address.toLowerCase() &&
        Number(r.chainId) === input.chainId,
    );
    if (simulation) {
      try {
        const atSimulation = await client.getCode({
          address,
          blockNumber: BigInt(simulation.hooked.block),
        });
        if (atSimulation && keccak256(atSimulation) === s.runtimeHash) {
          const scenario = node(
            "simulation:scenario",
            "Simulation scenario",
            simulation.scenarioId,
            {
              scope: simulation.scope,
              inputAmount: simulation.baseline.observed.inputAmount,
            },
            "SIMULATED",
            "Actual local Uniswap fixture",
          );
          const output = node(
            "simulation:result",
            "Simulation result",
            "Baseline versus hook execution",
            {
              baseline: simulation.baseline,
              hooked: simulation.hooked,
              beforeCalls: simulation.beforeCalls,
              afterCalls: simulation.afterCalls,
            },
            "SIMULATED",
            "Recorded Anvil receipts",
          );
          const balances = node(
            "simulation:balances",
            "Balance change",
            "Observed output accounting difference",
            {
              baselineOutput: simulation.baseline.observed.outputAmount,
              hookOutput: simulation.hooked.observed.outputAmount,
              fee: simulation.fee,
            },
            "SIMULATED",
            "Actual token balances and return values",
            ["Local fixture behavior is not arbitrary production behavior."],
          );
          for (const n of [scenario, output, balances]) {
            n.blockNumber = simulation.hooked.block;
            n.timestamp = simulation.timestamp;
            result.evidence.nodes.push(n);
          }
          result.evidence.edges.push(
            { from: "hook", to: scenario.id, type: "TESTED_BY" },
            { from: scenario.id, to: output.id, type: "PRODUCED_RESULT" },
            { from: output.id, to: balances.id, type: "PRODUCED_RESULT" },
          );
          const finding = result.findings.find((f) => f.id === "CAP-DELTA");
          if (finding) {
            finding.evidenceIds.push(balances.id);
            result.evidence.edges.push({
              from: balances.id,
              to: "finding:" + finding.id,
              type: "SUPPORTS_FINDING",
            });
          }
        }
      } catch {
        result.limitations.push(
          "Local simulation could not be bound to this observed runtime.",
        );
      }
    }
  }
  assertEvidence(result);
  return result;
}
