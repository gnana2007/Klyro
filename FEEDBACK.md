# Uniswap developer feedback — HSCAN

Project: https://github.com/gnana2007/Klyro
Feedback file: https://github.com/gnana2007/Klyro/blob/main/FEEDBACK.md
Form: https://developers.uniswap.org/hackathon-feedback
Submission status: **NOT SUBMITTED**. No confirmation or form receipt is fabricated.

## What worked

The official Hooks.sol constants made the fourteen-bit decoder unambiguous. The validity checks clarify that return-delta bits require their corresponding callback. Official PoolManager Initialize events provided an observable pool association rather than an address-bit heuristic.

The @uniswap/v4-core 1.0.2 npm package included the actual PoolManager, swap/liquidity test routers, forge-std and solmate fixtures. We ran baseline and hook-enabled swaps through those contracts and checked that the observed output difference equals the explicit hook fee. A live Ethereum scan found an initialized hook and matched its source using Sourcify's reported on-chain runtime hash.

## Friction encountered

On Windows, Solidity imports outside the contracts root required explicit allow_paths and library settings. The initial Foundry compile failed before these were configured. The bundled npm Foundry launcher did not reliably propagate its subprocess failure status in this environment, so our project runner calls the official platform binary directly.

The first-hook guide is useful for builders, but scanners also need a documented distinction between enabled address flags, implemented callbacks, and a proven pool association. Generic proxy detection cannot establish all behavior, and that uncertainty needs to survive rescans.

## Suggested documentation improvements

Add a read-only hook inspection example that pins every code, storage and event observation to the same block. Include Windows npm/Foundry remapping guidance, a clear address-permission immutability explanation, and an evidence-oriented example of return-delta balance accounting.

## Participant form completion

The form asks for a Telegram handle, personal participation/support ratings, future intentions and agreement to terms. These must be genuine participant responses. Include the feedback file URL above when submitting. Record the confirmation date/receipt here afterwards.
