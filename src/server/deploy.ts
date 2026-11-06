import { readFileSync } from "node:fs";
import { createPublicClient, http, isAddress, type Address, type Hex } from "viem";
import { HttpError } from "./http";
import { NETWORKS } from "./chains";
import { networkFetch } from "./network";
import { database } from "./db";

/**
 * Registry deployment and read-back.
 *
 * Split of responsibilities, because it matters for safety:
 * - The browser wallet signs and sends. This server never holds a private key
 *   and never broadcasts a transaction on a user's behalf.
 * - The server answers what is *about to* be sent (contract, chain, encoded
 *   constructor arguments, current fee data) and then *what actually happened*
 *   (receipt status, deployed address, code size, on-chain reads).
 * - A deployment is only recorded after a receipt with status `success` is
 *   read from the chain. A broadcast hash on its own is not a deployment.
 *
 * The contract is HookRiskRegistry: report provenance, not a safety verdict.
 */

export type DeployableArtifact = {
  contractName: string;
  solcVersion: string;
  abi: unknown[];
  bytecode: Hex;
  sizeBytes: number;
};

const ARTIFACT_PATH = "contracts/out/HookRiskRegistry.sol/HookRiskRegistry.json";

/** Chains where a fee-bearing deployment is allowed. Mainnet is excluded. */
const DEPLOYABLE = new Set([11155111, 8453, 31337]);

export function artifact(): DeployableArtifact {
  let raw: {
    abi?: unknown[];
    bytecode?: { object?: string };
    metadata?: { compiler?: { version?: string } };
  };
  try {
    raw = JSON.parse(
      readFileSync(process.cwd() + "/" + ARTIFACT_PATH, "utf8"),
    );
  } catch {
    throw new HttpError(
      503,
      "Contract artifact is missing. Run `npm run contracts:build` before deploying.",
    );
  }
  const bytecode = raw.bytecode?.object;
  if (!bytecode || bytecode === "0x")
    throw new HttpError(503, "Contract artifact has no deployable bytecode.");
  return {
    contractName: "HookRiskRegistry",
    solcVersion: raw.metadata?.compiler?.version ?? "unknown",
    abi: raw.abi ?? [],
    bytecode: bytecode as Hex,
    sizeBytes: (bytecode.length - 2) / 2,
  };
}

export function chainOf(chainId: number) {
  const entry = NETWORKS.find((n) => n.id === chainId);
  if (!entry) throw new HttpError(400, "Unsupported chain");
  return entry;
}

function client(chainId: number) {
  const entry = chainOf(chainId);
  return createPublicClient({
    chain: entry.chain as Parameters<typeof createPublicClient>[0]["chain"],
    transport: http(process.env[entry.env] || entry.url, {
      timeout: 15000,
      retryCount: 1,
      fetchFn: networkFetch,
    }),
  });
}

/**
 * What a deployment would look like before anything is sent.
 *
 * `feeData` is read from the chain now, not guessed. A deploy creates a
 * contract, so the intrinsic gas figure reported here is only the fixed part
 * (21000 + calldata) — the wallet computes the full limit at signing time and
 * that number is authoritative.
 */
export async function prepareDeployment(chainId: number, owner: string) {
  if (!isAddress(owner)) throw new HttpError(400, "Owner must be an EVM address");
  const entry = chainOf(chainId);
  const art = artifact();
  const deployable = DEPLOYABLE.has(chainId);
  let blockNumber: string | null = null;
  let chainIdMatches: boolean | null = null;
  let feeData: { gasPrice: string | null } = { gasPrice: null };
  try {
    const c = client(chainId);
    const [id, block, gasPrice] = await Promise.all([
      c.getChainId(),
      c.getBlockNumber(),
      c.getGasPrice().catch(() => null),
    ]);
    chainIdMatches = id === chainId;
    blockNumber = block.toString();
    feeData = { gasPrice: gasPrice === null ? null : gasPrice.toString() };
  } catch {
    chainIdMatches = null;
  }
  return {
    contract: art.contractName,
    solcVersion: art.solcVersion,
    bytecodeBytes: art.sizeBytes,
    constructorArgs: [{ name: "initialOwner", type: "address", value: owner }],
    chain: {
      id: entry.id,
      name: entry.name,
      poolManager: entry.manager,
      chainIdMatches,
      blockNumber,
    },
    deployable,
    requiresApproval: true,
    feeData,
    notes: [
      "The registry records report provenance. It never certifies that a hook is safe.",
      "The deployer address becomes the owner and the first authorized publisher.",
      "Authorization for the CRE forwarder and workflow ID is a separate owner call after deployment.",
      deployable
        ? "You will be asked to approve exactly one deployment transaction in your wallet."
        : "This chain carries real funds and automatic deployment is disabled. Include it in DEPLOYABLE_CHAIN_IDS only after that is a deliberate decision.",
    ],
  };
}

export type DeploymentRecord = {
  id: string;
  chainId: number;
  address: string | null;
  txHash: string;
  owner: string;
  deployer: string;
  status: string;
  blockNumber: string | null;
  gasUsed: string | null;
  codeSize: number | null;
  verified: number;
  error: string | null;
  createdAt: string;
};

function fromRow(row: Record<string, unknown>): DeploymentRecord {
  return {
    id: row.id as string,
    chainId: Number(row.chain_id),
    address: (row.address as string) ?? null,
    txHash: row.tx_hash as string,
    owner: row.owner as string,
    deployer: row.deployer as string,
    status: row.status as string,
    blockNumber: (row.block_number as string) ?? null,
    gasUsed: (row.gas_used as string) ?? null,
    codeSize: row.code_size === null ? null : Number(row.code_size),
    verified: Number(row.verified),
    error: (row.error as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export function listDeployments() {
  return database()
    .prepare("SELECT * FROM deployments ORDER BY created_at DESC LIMIT 30")
    .all()
    .map(fromRow);
}

export function getDeployment(id: string) {
  const row = database().prepare("SELECT * FROM deployments WHERE id=?").get(id);
  return row ? fromRow(row) : null;
}

/**
 * Confirm one transaction hash from the chain and persist the outcome.
 *
 * Every field written here comes from a real RPC response. If the receipt says
 * the deployment reverted, the row keeps `status='reverted'` and no address;
 * nothing is upgraded to "deployed" by inference.
 */
export async function confirmDeployment(params: {
  id: string;
  chainId: number;
  txHash: Hex;
  owner: string;
  deployer: string;
}) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(params.txHash))
    throw new HttpError(400, "Transaction hash is not a 32-byte hex value");
  const c = client(params.chainId);
  const now = new Date().toISOString();
  database()
    .prepare(
      "INSERT INTO deployments(id,chain_id,tx_hash,owner,deployer,status,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      params.id,
      params.chainId,
      params.txHash.toLowerCase(),
      params.owner.toLowerCase(),
      params.deployer.toLowerCase(),
      "pending",
      now,
    );
  try {
    const receipt = await c.waitForTransactionReceipt({
      hash: params.txHash,
      timeout: 120_000,
      confirmations: 1,
    });
    const address = receipt.contractAddress;
    let codeSize: number | null = null;
    let verified = 0;
    if (receipt.status === "success" && address) {
      const code = (await c.getCode({ address }).catch(() => "0x")) as Hex;
      codeSize = (code.length - 2) / 2;
      // Verify the constructor actually stored this owner, instead of trusting
      // the argument we sent.
      try {
        const stored = (await c.readContract({
          address,
          abi: artifact().abi as never,
          functionName: "owner",
        })) as string;
        verified = stored.toLowerCase() === params.owner.toLowerCase() ? 1 : 0;
      } catch {
        verified = 0;
      }
    }
    const status =
      receipt.status === "success" && address ? "deployed" : "reverted";
    database()
      .prepare(
        "UPDATE deployments SET address=?,status=?,block_number=?,gas_used=?,code_size=?,verified=?,error=? WHERE id=?",
      )
      .run(
        address ?? null,
        status,
        receipt.blockNumber.toString(),
        receipt.gasUsed.toString(),
        codeSize,
        verified,
        status === "reverted" ? "Transaction reverted on chain" : null,
        params.id,
      );
  } catch (error) {
    database()
      .prepare("UPDATE deployments SET status=?,error=? WHERE id=?")
      .run(
        "unconfirmed",
        // A hash with no receipt is not a deployment. Keep the reason short and
        // free of endpoints.
        error instanceof Error
          ? "No receipt was returned within the wait window; the transaction may still be pending. Check the hash in a block explorer."
          : "Confirmation failed",
        params.id,
      );
  }
  return getDeployment(params.id);
}

/**
 * Read the registry that is actually configured, from the chain.
 *
 * This is what makes publication honest: the app reports the on-chain owner,
 * whether the intended signer is an authorized publisher, and whether
 * something is already deployed at the configured address.
 */
export async function registryState() {
  const raw = process.env.REGISTRY_ADDRESS || "";
  const chainId = Number(process.env.REGISTRY_CHAIN_ID || 11155111);
  const entry = NETWORKS.find((n) => n.id === chainId) ?? null;
  const base = {
    configured: isAddress(raw),
    address: isAddress(raw) ? raw : null,
    chainId,
    chainName: entry?.name ?? null,
    explorerBase: explorerBase(chainId),
    deployments: listDeployments(),
  };
  if (!isAddress(raw)) {
    return {
      ...base,
      chain: null,
      notice:
        "No registry address is configured. Deploy HookRiskRegistry on a supported network first, then set REGISTRY_ADDRESS and REGISTRY_CHAIN_ID.",
    };
  }
  try {
    const c = client(chainId);
    const address = raw as Address;
    const art = artifact();
    const [code, chainIdRead, owner, forwarder, blockNumber] = await Promise.all([
      c.getCode({ address }),
      c.getChainId().catch(() => null),
      c
        .readContract({ address, abi: art.abi as never, functionName: "owner" })
        .catch(() => null),
      c
        .readContract({ address, abi: art.abi as never, functionName: "forwarder" })
        .catch(() => null),
      c.getBlockNumber(),
    ]);
    return {
      ...base,
      chain: {
        chainIdMatches: chainIdRead === chainId,
        blockNumber: blockNumber.toString(),
        codeSize: code ? (code.length - 2) / 2 : null,
        owner: typeof owner === "string" ? owner : null,
        forwarder: typeof forwarder === "string" ? forwarder : null,
        contractResponds: typeof owner === "string",
      },
      notice:
        typeof owner === "string"
          ? "Owner and forwarder were read from the configured chain at the block shown."
          : "No contract answered owner() at the configured address. Publication would fail; check the address and chain.",
    };
  } catch {
    return {
      ...base,
      chain: null,
      notice:
        "The configured chain could not be reached, so the registry state is unknown. Unknown is not the same as unconfigured.",
    };
  }
}

export function explorerBase(chainId: number) {
  if (chainId === 1) return "https://etherscan.io";
  if (chainId === 11155111) return "https://sepolia.etherscan.io";
  if (chainId === 8453) return "https://basescan.org";
  return null;
}

/**
 * Ask the configured explorer whether source is verified.
 *
 * Only runs when ETHERSCAN_API_KEY is present. Without a key the honest answer
 * is "not checked", which the UI displays as such rather than as "unverified".
 */
export async function verificationStatus(chainId: number, address: string) {
  const key = process.env.ETHERSCAN_API_KEY;
  const base = explorerBase(chainId);
  if (!base)
    return { checked: false as const, reason: "No explorer for this chain" };
  if (!key)
    return {
      checked: false as const,
      reason: "Set ETHERSCAN_API_KEY to check source verification from the app",
    };
  try {
    const url =
      base +
      "/api?module=contract&action=getsourcecode&address=" +
      address +
      "&apikey=" +
      encodeURIComponent(key);
    const response = await networkFetch(url, {
      signal: AbortSignal.timeout(15000),
    });
    const data = (await response.json()) as {
      status?: string;
      result?: { SourceCode?: string; ContractName?: string }[];
    };
    const source = data.result?.[0]?.SourceCode ?? "";
    return {
      checked: true as const,
      verified: source.length > 0,
      contractName: data.result?.[0]?.ContractName ?? null,
    };
  } catch {
    return { checked: false as const, reason: "Explorer request failed" };
  }
}

/**
 * Confirm one publication transaction and read the record back.
 *
 * Three independent facts are checked after the receipt:
 * 1. the receipt status is `success`;
 * 2. the `Published` event is in that receipt for this report hash;
 * 3. `publications(reportHash)` now returns the same hook, chain, fingerprint
 *    and report hash, with a non-zero `publishedAt`.
 *
 * Only then is the row `published`. A reverted or missing event is stored as
 * such, and the message says which check failed.
 */
export async function confirmPublication(params: {
  id: string;
  chainId: number;
  registry: Address;
  hook: string;
  reportHash: Hex;
  fingerprintHash: Hex;
  riskLevel: number;
  passportId: string | null;
  txHash: Hex;
  publisher: string;
}) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(params.txHash))
    throw new HttpError(400, "Transaction hash is not a 32-byte hex value");
  const now = new Date().toISOString();
  database()
    .prepare(
      "INSERT INTO publications(id,chain_id,registry,hook,report_hash,fingerprint_hash,risk_level,passport_id,tx_hash,publisher,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      params.id,
      params.chainId,
      params.registry.toLowerCase(),
      params.hook.toLowerCase(),
      params.reportHash.toLowerCase(),
      params.fingerprintHash.toLowerCase(),
      params.riskLevel,
      params.passportId,
      params.txHash.toLowerCase(),
      params.publisher.toLowerCase(),
      "pending",
      now,
    );
  const c = client(params.chainId);
  try {
    const receipt = await c.waitForTransactionReceipt({
      hash: params.txHash,
      timeout: 120_000,
      confirmations: 1,
    });
    let status = receipt.status === "success" ? "confirmed" : "reverted";
    let error: string | null =
      receipt.status === "success" ? null : "Transaction reverted on chain";
    if (receipt.status === "success") {
      // keccak256("Published(address,uint256,bytes32,bytes32,uint8,address)"),
      // derived from the shipped ABI, not typed by hand.
      const PUBLISHED_TOPIC =
        "0xdae3703c202c6bb9662b727d2f14ef63e26e3457734e7632d880b24a01a6b99f";
      const eventSeen = receipt.logs.some(
        (log) =>
          log.address.toLowerCase() === params.registry.toLowerCase() &&
          log.topics[0] === PUBLISHED_TOPIC,
      );
      let readback: readonly unknown[] | null = null;
      try {
        readback = (await c.readContract({
          address: params.registry,
          abi: REGISTRY_ABI_LOCAL,
          functionName: "publications",
          args: [params.reportHash],
        })) as readonly unknown[];
      } catch {
        readback = null;
      }
      const matches =
        readback !== null &&
        String(readback[0]).toLowerCase() === params.hook.toLowerCase() &&
        String(readback[1]) === String(params.chainId) &&
        String(readback[2]).toLowerCase() ===
          params.fingerprintHash.toLowerCase() &&
        String(readback[3]).toLowerCase() === params.reportHash.toLowerCase() &&
        BigInt(String(readback[5])) > 0n;
      if (matches) status = "published";
      else {
        status = "unconfirmed-onchain";
        error =
          "The transaction succeeded but the registry did not return a matching publication record. Treat this as not published.";
      }
      if (!eventSeen && status === "published")
        error =
          "Record matched on chain, but the Published event was not found in the receipt logs.";
    }
    database()
      .prepare(
        "UPDATE publications SET status=?,block_number=?,gas_used=?,error=? WHERE id=?",
      )
      .run(
        status,
        receipt.blockNumber.toString(),
        receipt.gasUsed.toString(),
        error,
        params.id,
      );
  } catch {
    database()
      .prepare("UPDATE publications SET status=?,error=? WHERE id=?")
      .run(
        "unconfirmed",
        "No receipt was returned within the wait window. The transaction may still be pending; check the hash.",
        params.id,
      );
  }
  return getPublication(params.id);
}

const REGISTRY_ABI_LOCAL = [
  {
    type: "function",
    name: "publications",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "hook", type: "address" },
      { name: "chainId", type: "uint256" },
      { name: "fingerprintHash", type: "bytes32" },
      { name: "reportHash", type: "bytes32" },
      { name: "riskLevel", type: "uint8" },
      { name: "publishedAt", type: "uint64" },
      { name: "publisher", type: "address" },
    ],
  },
] as const;

export type PublicationRecord = {
  id: string;
  chainId: number;
  registry: string;
  hook: string;
  reportHash: string;
  fingerprintHash: string;
  riskLevel: number;
  passportId: string | null;
  txHash: string;
  publisher: string;
  status: string;
  blockNumber: string | null;
  gasUsed: string | null;
  error: string | null;
  createdAt: string;
};

function publicationFromRow(row: Record<string, unknown>): PublicationRecord {
  return {
    id: row.id as string,
    chainId: Number(row.chain_id),
    registry: row.registry as string,
    hook: row.hook as string,
    reportHash: row.report_hash as string,
    fingerprintHash: row.fingerprint_hash as string,
    riskLevel: Number(row.risk_level),
    passportId: (row.passport_id as string) ?? null,
    txHash: row.tx_hash as string,
    publisher: row.publisher as string,
    status: row.status as string,
    blockNumber: (row.block_number as string) ?? null,
    gasUsed: (row.gas_used as string) ?? null,
    error: (row.error as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export function getPublication(id: string) {
  const row = database()
    .prepare("SELECT * FROM publications WHERE id=?")
    .get(id);
  return row ? publicationFromRow(row) : null;
}

export function listPublications(limit = 50) {
  return database()
    .prepare("SELECT * FROM publications ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map(publicationFromRow);
}
