# Uniswap Foundation — Build with Uniswap

Core code: src/core/permissions.ts mirrors all fourteen Hooks.sol flags and dependency checks. src/server/scan.ts reads real runtime bytecode and official PoolManager Initialize events. contracts/src/LocalScenario.sol imports the actual v4 PoolManager and official routers and exercises beforeSwap, afterSwap and return-delta accounting.

Proof: evidence/live-hook-scan.json contains the actual Ethereum hook, block/hash, runtime hash, source match, six observed pool associations and evidence-linked findings. evidence/local-simulation.json contains actual Anvil swap receipts/balance deltas. Foundry registry and behavioral tests passed; current command results are in EVIDENCE.md.

Official resources inspected: https://docs.uniswap.org/contracts/v4/overview, https://docs.uniswap.org/contracts/v4/guides/hooks/your-first-hook, https://docs.uniswap.org/sdk/v4/overview, https://developers.uniswap.org/docs/protocols/v4/deployments and https://github.com/Uniswap/v4-core/blob/main/src/libraries/Hooks.sol.

FEEDBACK.md contains observed developer feedback. The separate participant form is not yet submitted. Do not claim full sponsor eligibility until that submission is confirmed.
