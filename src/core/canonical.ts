import { keccak256, toHex } from "viem";
export const ANALYSIS_VERSION = "hscan-rules/1.0.0";
export function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite canonical number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object")
    return (
      "{" +
      Object.keys(value as object)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  throw new Error(
    "Unsupported canonical value; use explicit null and decimal strings for big integers",
  );
}
export function hash(value: unknown) {
  return keccak256(toHex(canonical(value)));
}
export function fingerprints(input: {
  chainId: number;
  address: string;
  runtimeHash: string;
  proxy: unknown;
  permissionBitmap: number;
  analysisVersion: string;
  blockNumber: string;
  blockHash: string;
  config?: unknown;
}) {
  const state = {
    schema: "hscan.state.v1",
    chainId: input.chainId,
    address: input.address.toLowerCase(),
    runtimeHash: input.runtimeHash,
    proxy: input.proxy,
    permissionBitmap: input.permissionBitmap,
    analysisVersion: input.analysisVersion,
    config: input.config ?? null,
  };
  const stateFingerprint = hash(state);
  return {
    stateFingerprint,
    observationFingerprint: hash({
      schema: "hscan.observation.v1",
      stateFingerprint,
      blockNumber: input.blockNumber,
      blockHash: input.blockHash,
    }),
  };
}
