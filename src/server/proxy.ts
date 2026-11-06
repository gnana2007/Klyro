import {
  keccak256,
  toHex,
  getAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import type { Proxy } from "../core/types";
import { clientFor } from "./chains";
import { inspectOpcodes } from "../core/analysis";
export function storageSlot(label: string): Hex {
  return toHex(BigInt(keccak256(toHex(label))) - 1n, { size: 32 });
}
export const SLOTS = {
  implementation: storageSlot("eip1967.proxy.implementation"),
  admin: storageSlot("eip1967.proxy.admin"),
  beacon: storageSlot("eip1967.proxy.beacon"),
};
const addressFrom = (s: string | undefined): Address | null =>
  s && s.length === 66 && !/^0x0+$/.test(s)
    ? getAddress("0x" + s.slice(-40))
    : null;
export async function resolveProxy(
  client: ReturnType<typeof clientFor>,
  address: Address,
  code: Hex,
  blockNumber: bigint,
): Promise<Proxy> {
  const result: Proxy = {
    kind: "direct",
    implementation: null,
    implementationHash: null,
    admin: null,
    beacon: null,
    resolved: true,
    limitations: ["Unrecognized proxy patterns can remain undetected."],
  };
  const minimal =
    /^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3$/.exec(
      code,
    );
  if (minimal) {
    result.kind = "minimal";
    result.implementation = getAddress("0x" + minimal[1]);
  } else {
    const reads = await Promise.allSettled(
      Object.values(SLOTS).map((slot) =>
        client.getStorageAt({ address, slot, blockNumber }),
      ),
    );
    if (reads.some((r) => r.status === "rejected")) {
      result.kind = "unknown";
      result.resolved = false;
      result.limitations.push("One or more EIP-1967 storage reads failed.");
    }
    const values = reads.map((r) =>
      r.status === "fulfilled" ? addressFrom(r.value) : null,
    );
    result.admin = values[1];
    result.beacon = values[2];
    if (values[0]) {
      result.kind = "eip1967";
      result.implementation = values[0];
    } else if (values[2]) {
      result.kind = "beacon";
      try {
        result.implementation = await client.readContract({
          address: values[2],
          abi: parseAbi(["function implementation() view returns (address)"]),
          functionName: "implementation",
          blockNumber,
        });
      } catch {
        result.resolved = false;
        result.limitations.push("Beacon implementation() call failed.");
      }
    } else if (hasDelegateCall(code) && result.kind === "direct") {
      result.kind = "unknown";
      result.resolved = false;
      result.limitations.push(
        "DELEGATECALL instruction present; proxy type not established.",
      );
    }
  }
  if (result.implementation && result.implementation !== zeroAddress) {
    try {
      const impl = await client.getCode({
        address: result.implementation as Address,
        blockNumber,
      });
      if (!impl || impl === "0x") throw new Error("No implementation code");
      result.implementationHash = keccak256(impl);
      result.resolved = true;
    } catch {
      result.resolved = false;
      result.limitations.push("Implementation bytecode unavailable.");
    }
  }
  return result;
}
function hasDelegateCall(code: string) {
  const bytes = Buffer.from(code.slice(2), "hex");
  for (let i = 0; i < bytes.length; i++) {
    const op = bytes[i];
    if (op === 0xf4) return true;
    if (op >= 0x60 && op <= 0x7f) i += op - 0x5f;
  }
  return false;
}
