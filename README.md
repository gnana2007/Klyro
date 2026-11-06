# Klyro

**Know what a hook does. See what changed. Verify what you trust.**

Klyro is an evidence-driven Uniswap v4 hook investigation workbench. Developers and liquidity providers can inspect capabilities, trace deterministic findings, compare historical observations and share a version-specific, independently hashable report.

Hooks customize pool behavior, and their capabilities, code, upgrade paths and accounting effects need separate evidence. Existing hook scanners already exist; Klyro combines change-aware analysis, navigable evidence and reproducible passports.

## Status — 6 November 2026

The core application is implemented and locally verified. **The full hackathon checklist is not complete.** Actual 0G inference, an authenticated CRE CLI simulation, the participant feedback submission, a human-narrated video and public hosting are outstanding. See [the complete requirement tracker](docs/requirements.md) and [execution evidence](EVIDENCE.md). There are no fabricated IDs, transactions, sponsor successes or screenshots.

- Live local application: [http://127.0.0.1:3000](http://127.0.0.1:3000) while the local server is running.
- Public hosted demo: not published. Automatic approval review rejected a public tunnel; specific approval is pending.
- Demo video: pending human recording. [Under-three-minute script](docs/demo-script.md).

## What works

- Actual RPC bytecode/storage/event observations at one block, including a confirmed live Ethereum hook/pool association and runtime-matched Sourcify source.
- All fourteen address permission flags, dependency checks, exact clone/EIP-1967/beacon handling and explicit unknown states.
- Deterministic evidence-linked findings and a documented attention index; AI never defines risk scores or changes findings.
- SQLite scan history, rescan comparison, proxy-aware implementation changes and finding reassessment.
- Interactive evidence navigation with method, block, timestamp, raw observation and limitations.
- Real Uniswap v4 baseline/hook fixture on Foundry and Anvil, with observed callback counts, return-delta fee, balances, receipts and gas.
- Canonical Hook Passports, browser-side hashing, tamper rejection, registry readback and a separate current-contract match.
- Official 0G Router integration and CRE workflow code with honest unavailable/blocked states. CRE compiled to WASM; compilation is not successful CLI simulation.

A passport is a record of bounded analysis, not a safety certificate. Local fixtures are not production-hook simulations.

## Stack and architecture

Next.js 16.4.5, React, TypeScript, Zod, viem, Node 24 built-in SQLite, Solidity 0.8.26, official @uniswap/v4-core 1.0.2, Foundry 1.7.1, Chainlink CRE SDK 1.23.0 and documented 0G Router APIs. Dependencies are pinned in package-lock.json. The scanner requires no wallet connection or private key.

Browser → typed API → block-pinned observations → deterministic rules/evidence → SQLite snapshot → diff → optional 0G explanation → immutable passport → CRE validation/publication → registry. [Architecture and trust boundaries](docs/architecture.md).

## Setup

Node.js **24 or newer**, npm and Git are required. The npm installation includes official platform-specific Foundry binaries and the official Uniswap test dependencies. Solidity downloads on first build.

```sh
git clone https://github.com/gnana2007/Klyro.git
cd Klyro
npm ci
node -e "require('node:fs').copyFileSync('.env.example','.env.local')"
npm run simulation
npm run dev
```

Open http://127.0.0.1:3000 and select **Load local test hook**, then scan. The simulation runner starts an isolated loopback Anvil node when needed and refuses non-local chains. It uses the public Anvil development mnemonic, never a personal wallet. Its local process ID is recorded in data/anvil.pid.

For live read-only inspection choose Ethereum, Sepolia or Base and a genuinely deployed address. The scanner reports UNKNOWN when pool association or source cannot be established. `node --import tsx scripts/discover.ts` discovers a live Ethereum hook from recent official initialization events and saves its actual report.

### Configuration

.env.example documents all server-only settings. RPC_ETHEREUM/RPC_SEPOLIA/RPC_BASE default to public read endpoints. RPC_LOCAL points to Anvil. DATABASE_PATH defaults to ./data/hscan.sqlite. Never put credentials in NEXT_PUBLIC_* variables or commit an environment file.

0G requires ZERO_G_API_KEY, a real ZERO_G_MODEL and confirmation of usable existing free credits through ZERO_G_FREE_CREDITS_CONFIRMED=true. The user authorizes free credits only; the app never deposits funds. The primary scan workflow requests private routing and TEE verification when enabled. Actual x_0g_trace.request_id and provider metadata are persisted. Without 0G, explanation and inference provenance are unavailable. Independent TEE verification is explicitly NOT_PERFORMED.

For registry readback set the actual REGISTRY_ADDRESS and REGISTRY_CHAIN_ID. For a local demo these are returned by npm run simulation; they are not public-chain deployments. Set APP_ORIGIN to the deployed origin; optional APP_ADDITIONAL_ORIGINS is an explicit comma-separated allowlist. Set OPERATOR_TOKEN before enabling protected operations in production.

### Run and test

```sh
npm run typecheck
npm test
npm run contracts:test -- -vv
npm run build
npm run dev
# In another terminal, after the simulation fixture exists:
node --import tsx scripts/integration.ts
node --import tsx scripts/proxy-integration.ts
npm run test:e2e
```

On Windows, browser tests use the installed Microsoft Edge. On Linux/macOS run `npx playwright install chromium`; omit BROWSER_PATH or set it to chromium. BROWSER_PATH may also be an explicit browser executable path.

Verified locally: **40 unit tests, 11 Foundry tests, 6 browser tests, production build, real live-chain scan, local scan/passport/registry integration and actual proxy upgrade detection**. The Foundry count includes ten registry tests and one behavioral test. See EVIDENCE.md for actual runs and initial failures fixed.

The attention index is capped at 100: info=0, low=5, medium=15, high=30. It measures rule-weighted investigation attention, not exploit probability, safety or a full audit result.

## Sponsor integration evidence

Only selected partners: **Uniswap Foundation, 0G, Chainlink**. [Uniswap evidence](docs/sponsors/uniswap.md), [0G evidence and blocker](docs/sponsors/0g.md), [Chainlink evidence and blocker](docs/sponsors/chainlink.md).

| Integration | Exact source |
|---|---|
| Permission decoder | [src/core/permissions.ts:39](https://github.com/gnana2007/Klyro/blob/main/src/core/permissions.ts#L39) |
| Block-pinned scanner and pool context | [src/server/scan.ts:35](https://github.com/gnana2007/Klyro/blob/main/src/server/scan.ts#L35) |
| Risk rules and graph checks | [src/core/analysis.ts:9](https://github.com/gnana2007/Klyro/blob/main/src/core/analysis.ts#L9) |
| Fingerprints | [src/core/canonical.ts:32](https://github.com/gnana2007/Klyro/blob/main/src/core/canonical.ts#L32) |
| Historical diff | [src/core/diff.ts:3](https://github.com/gnana2007/Klyro/blob/main/src/core/diff.ts#L3) |
| Actual v4 PoolManager fixture | [contracts/src/LocalScenario.sol:54](https://github.com/gnana2007/Klyro/blob/main/contracts/src/LocalScenario.sol#L54) |
| Return-delta callback | [contracts/src/LocalScenario.sol:38](https://github.com/gnana2007/Klyro/blob/main/contracts/src/LocalScenario.sol#L38) |
| 0G inference and request evidence | [src/server/ai.ts:45](https://github.com/gnana2007/Klyro/blob/main/src/server/ai.ts#L45) |
| CRE orchestration | [cre/main.ts:41](https://github.com/gnana2007/Klyro/blob/main/cre/main.ts#L41) |
| Registry and receiver interface | [contracts/src/HookRiskRegistry.sol:5](https://github.com/gnana2007/Klyro/blob/main/contracts/src/HookRiskRegistry.sol#L5) |
| Canonical passport and verification | [src/server/passport.ts:19](https://github.com/gnana2007/Klyro/blob/main/src/server/passport.ts#L19) |

## CRE

Read [cre/README.md](cre/README.md). Install the official CLI and Bun, log in, and configure a real Sepolia passport URL. `cre workflow simulate . --target staging-settings --trigger-index 0 --non-interactive` runs from cre/. No --broadcast flag is used by default. On-chain publication requires explicit transaction authorization and a registry configured for the trusted forwarder and workflow ID. A failed login is preserved in evidence/cre-attempt.txt.

## Actual deployment and transaction records

[evidence/local-simulation.json](evidence/local-simulation.json) contains local chain-31337 contract addresses and swap receipts. [evidence/integration.json](evidence/integration.json) contains the actual local registry publication transaction and report hash. [evidence/proxy-upgrade.json](evidence/proxy-upgrade.json) contains an actual local upgrade. No local address or receipt is presented as a public explorer record.

## Deployment

Use a persistent Node host with a mounted SQLite volume. `npm run build` then `npm start` runs production. A Dockerfile and compose.yaml are supplied; the container configuration has not been deployment-tested here. `docker compose up --build` expects a private .env configuration. Keep the SQLite volume persistent and set APP_ORIGIN before serving the app. A stable public deployment requires an approved host; public tunnel publication is pending specific authorization.

The background scan worker requires a continuously running Node process. Do not use request-terminating serverless hosting without replacing it with a durable queue. Cloudflare Worker-only hosting does not support the selected node:sqlite runtime. [Deployment details](docs/deployments.md).

## Limits, compliance and disclosure

Read [security limits](docs/security-limitations.md), [passport schema](docs/hook-passport.md), [diff semantics](docs/hook-behavior-diff.md) and [evidence graph](docs/evidence-graph.md). There is no arbitrary transaction endpoint and no AI-generated contract execution.

[FEEDBACK.md](FEEDBACK.md) records genuine developer observations. The separate [Uniswap feedback form](https://developers.uniswap.org/hackathon-feedback) has not been submitted. Participant-specific ratings, Telegram handle, event lane, actual human contributions and terms cannot be invented. Human narration and participant submission remain pending.

[AI assistance disclosure](docs/ai/AI_DISCLOSURE.md) and [prompt provenance](docs/ai/PROMPTS.md). Application code is MIT; dependencies retain their own licenses, including Uniswap's applicable source licenses and Hallmark's MIT license. See THIRD_PARTY_NOTICES.md.
