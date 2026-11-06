import { keccak256, type Hex } from "viem";
import type { Snapshot } from "../core/types";
import { networkFetch } from "./network";
// Read-only Sourcify v2 API. Legacy v1 was retired; exact observed runtime matching is required.
export async function verifiedSource(
  chainId: number,
  address: string,
  expectedHash: string,
): Promise<Snapshot["source"]> {
  const result: Snapshot["source"] = {
    status: "UNKNOWN",
    url: `https://repo.sourcify.dev/${chainId}/${address}`,
    files: [],
  };
  if (chainId === 31337) return result;
  try {
    const response = await networkFetch(
      `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=all`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) return result;
    const text = await response.text();
    if (text.length > 6000000) return result;
    const data = JSON.parse(text);
    const code = data.runtimeBytecode?.onchainBytecode;
    if (
      !data.runtimeMatch ||
      typeof code !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(code) ||
      keccak256(code as Hex) !== expectedHash
    )
      return result;
    let size = 0;
    for (const [name, value] of Object.entries(data.sources ?? {})) {
      const content = (value as { content?: unknown }).content;
      if (
        typeof content === "string" &&
        content.length < 500000 &&
        size + content.length < 2500000
      ) {
        result.files.push({ name, content });
        size += content.length;
      }
    }
    if (result.files.length) result.status = "VERIFIED";
  } catch {}
  return result;
}
