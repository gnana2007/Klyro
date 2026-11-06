import type { Permission } from "./types";
// Official source: Uniswap/v4-core src/libraries/Hooks.sol, ALL_HOOK_MASK and flags.
const FLAGS = [
  ["beforeInitialize", 13, "Runs before a pool is initialized."],
  ["afterInitialize", 12, "Runs after pool initialization."],
  ["beforeAddLiquidity", 11, "Runs before liquidity is added."],
  ["afterAddLiquidity", 10, "Runs after liquidity is added."],
  ["beforeRemoveLiquidity", 9, "Runs before liquidity is removed."],
  ["afterRemoveLiquidity", 8, "Runs after liquidity is removed."],
  [
    "beforeSwap",
    7,
    "Runs before a swap and may set a dynamic LP fee when the pool permits it.",
  ],
  ["afterSwap", 6, "Runs after a swap."],
  ["beforeDonate", 5, "Runs before a donation."],
  ["afterDonate", 4, "Runs after a donation."],
  [
    "beforeSwapReturnDelta",
    3,
    "May change swap accounting through a before-swap delta.",
  ],
  [
    "afterSwapReturnDelta",
    2,
    "May change accounting through an after-swap delta.",
  ],
  [
    "afterAddLiquidityReturnDelta",
    1,
    "May return an accounting delta after adding liquidity.",
  ],
  [
    "afterRemoveLiquidityReturnDelta",
    0,
    "May return an accounting delta after removing liquidity.",
  ],
] as const;
export function decodePermissions(address: string): Permission[] {
  const bits = Number(BigInt(address) & ((1n << 14n) - 1n));
  return FLAGS.map(([name, bit, description]) => ({
    name,
    bit,
    description,
    enabled: (bits & (1 << bit)) !== 0,
  }));
}
export function validPermissionDependencies(permissions: Permission[]) {
  const enabled = new Set(
    permissions.filter((p) => p.enabled).map((p) => p.name),
  );
  return [
    ["beforeSwapReturnDelta", "beforeSwap"],
    ["afterSwapReturnDelta", "afterSwap"],
    ["afterAddLiquidityReturnDelta", "afterAddLiquidity"],
    ["afterRemoveLiquidityReturnDelta", "afterRemoveLiquidity"],
  ].every(([delta, callback]) => !enabled.has(delta) || enabled.has(callback));
}
