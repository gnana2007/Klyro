# Klyro

**Know what a hook does. See what changed. Verify what you trust.**

Klyro is an evidence-driven Uniswap v4 hook investigation workbench. Developers and liquidity providers can inspect capabilities, trace deterministic findings, compare historical observations and share a version-specific, independently hashable report.

Hooks customize pool behavior, and their capabilities, code, upgrade paths and accounting effects need separate evidence. Existing hook scanners already exist; Klyro combines change-aware analysis, navigable evidence and reproducible passports.

## Status — 7 November 2026

The core application is implemented and locally verified. **The full hackathon checklist is not complete.** Actual 0G inference, an authenticated CRE CLI simulation, the participant feedback submission, a human-narrated video and public hosting are outstanding. See [the complete requirement tracker](docs/requirements.md) and [execution evidence](EVIDENCE.md). There are no fabricated IDs, transactions, sponsor successes or screenshots.

- Live local application: [http://127.0.0.1:3000](http://127.0.0.1:3000) while the local server is running.
- The editorial product site lives at `/`; the investigation workspace lives at `/app`. Legacy root query links redirect with their query values intact.
- Live backend check: [http://127.0.0.1:3000/api/health/live](http://127.0.0.1:3000/api/health/live). On this host, Ethereum, Sepolia, Base and local Anvil returned current blocks after the native HTTP transport fix. The latest Ethereum scan completed at block 26356361 with runtime-matched source, two observed pools and four persisted activity rows that survive a rescan without duplication. A Base scan of `0xb200…ce01` demonstrates the honest-unknown path: no pool in the window, invalid flag dependencies reported as `HOOK-FLAGS`, and zero participants rather than invented ones. [Live backend plan and key setup](docs/backend-live-plan.md).

- Public hosted demo: not published. Automatic approval review rejected a public tunnel; specific approval is pending.
- Demo video: pending human recording. [Under-three-minute script](docs/demo-script.md).

## What works

- Actual RPC bytecode/storage/event observations at one block, including a confirmed live Ethereum hook/pool association and runtime-matched Sourcify source.
- All fourteen address permission flags, dependency checks, exact clone/EIP-1967/beacon handling and explicit unknown states.
- Deterministic evidence-linked findings and a documented attention index; AI never defines risk scores or changes findings.
- SQLite scan history, rescan comparison, proxy-aware implementation changes and finding reassessment.
- Interactive evidence navigation with method, block, timestamp, raw observation and limitations.
- Hook identity panel: hook status derived from PoolManager `Initialize` events, bounded deployment lookup, owner getter, proxy admin and manager.
- Participant ledger where every role carries the evidence string that justified it, and a paginated activity table persisted in SQLite and filtered by kind, block range and address.
- Real Uniswap v4 baseline/hook fixture on Foundry and Anvil, with observed callback counts, return-delta fee, balances, receipts and gas.
- Canonical Hook Passports, browser-side hashing, tamper rejection, registry readback and a separate current-contract match.
- Official 0G Router integration and CRE workflow code with honest unavailable/blocked states. CRE compiled to WASM; compilation is not successful CLI simulation.
- A header wallet control that detects injected wallets through EIP-6963 (with `window.ethereum` as a fallback), shows the shortened address and current network, offers an explicit network switch between Ethereum Mainnet (1), Sepolia (11155111), Base Mainnet (8453) and Local Anvil (31337), and follows account and network changes. A rejected prompt is reported as a rejection, and Klyro never switches the user's network on its own.
- Wallet-signed registry deployment and report publication (`/?view=deploy`). The server prepares the exact transaction and reads the receipt back; it holds no key, and nothing is recorded as deployed or published without a confirmed chain response. Analysis stays usable with no wallet at all.
- Scheduled hook monitoring with a durable SQLite lease, per-run history, backoff and restart recovery; monitoring survives restarts and never double scans a hook.
- Live 0G diagnosis: the configured account returns HTTP 402 `pay_no_balance`, so inference is reported unavailable rather than fabricated. The app distinguishes empty credits from a wrong model id.

A passport is a record of bounded analysis, not a safety certificate. Local fixtures are not production-hook simulations.

## Stack and architecture

Next.js 16.4.5, React, TypeScript, Zod, viem, Node 24 built-in SQLite, Solidity 0.8.26, official @uniswap/v4-core 1.0.2, Foundry 1.7.1, Chainlink CRE SDK 1.23.0 and documented 0G Router APIs. Dependencies are pinned in package-lock.json. The scanner requires no wallet connection or private key. A wallet is needed only to deploy the registry or publish a report, and each of those is one explicit approval in your own wallet.

Browser → typed API → block-pinned observations → deterministic rules/evidence → SQLite snapshot → relational facts (hook, activities, participants) → diff → optional 0G explanation → immutable passport → CRE validation/publication → registry. [Architecture and trust boundaries](docs/architecture.md).

Read-only API used by the workbench: `GET /api/health`, `GET /api/health/live`, `GET /api/scans`, `GET /api/scans/:id`, `GET /api/hooks/:chain/:address/history|profile|activity`, `GET /api/evidence/:scanId`, `GET /api/passports[/:id]`, `GET /api/verify/:passportId`, `GET /api/registry`; `POST /api/scans`, `/api/diffs`, `/api/ai/explain`, `/api/passports`, `/api/verify/:id`. Non-GET requests must send `application/json` and, when an `Origin` header is present, must be same-origin or a configured application origin.

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

Open http://127.0.0.1:3000, choose **Investigate a hook**, then select **Load local test hook** and scan. The simulation runner starts an isolated loopback Anvil node when needed and refuses non-local chains. It uses the public Anvil development mnemonic, never a personal wallet. Its local process ID is recorded in data/anvil.pid.

For live read-only inspection choose Ethereum, Sepolia or Base and a genuinely deployed address. The scanner reports UNKNOWN when pool association or source cannot be established. `node --import tsx scripts/discover.ts` discovers a live Ethereum hook from recent official initialization events and saves its actual report.

### Configuration

.env.example documents all server-only settings. RPC_ETHEREUM/RPC_SEPOLIA/RPC_BASE default to public read endpoints. RPC_LOCAL points to Anvil. DATABASE_PATH defaults to ./data/hscan.sqlite. Never put credentials in NEXT_PUBLIC_* variables or commit an environment file.

An AI explainer is **optional**. With no ZERO_G_API_KEY, no ZERO_G_MODEL or ZERO_G_FREE_CREDITS_CONFIRMED unset, every scan still completes: findings, evidence, diffs, hashes and passports do not depend on a model, and the app records "no explanation requested" rather than generating text. To enable it, set ZERO_G_API_KEY, a real ZERO_G_MODEL, and ZERO_G_FREE_CREDITS_CONFIRMED=true after confirming usable existing free credits. The user authorizes free credits only; the app never deposits funds. When enabled, private routing and TEE verification are requested, and the actual x_0g_trace.request_id and provider metadata are persisted. Independent TEE verification is explicitly NOT_PERFORMED.

Two API contracts the UI relies on. `GET /api/health` answers 200 with `status` (`ok` or `degraded`), `database`, `storage` (`ok`, the path actually in use, `durable`, and a reason), the supported networks and which optional integrations are configured; it answers even when storage is unusable, because that is what the endpoint exists to report. `GET /api/scans` answers `{ scans, unreadable, storage, notice }` so an empty history and a corrupted one are never presented as the same thing. A server-side failure answers 500 (`INTERNAL_ERROR`) and a storage failure 503 (`STORAGE_UNAVAILABLE`); a malformed request is the only thing that answers 400.

On a serverless host with no persistent disk, an unwritable `DATABASE_PATH` falls back to a per-instance temporary database so read-only analysis keeps working. The health endpoint reports that database as non-durable and `/api/scans` reports `storage: "ephemeral"`; history is not preserved across instances. Point `DATABASE_PATH` at a real volume to keep it.

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

Verified on 7 November 2026: **104 Vitest tests and 28 Playwright tests (desktop and mobile viewports) passed, the production build passed, a real live-chain scan ran with no wallet installed, and local scan/passport/registry integration and proxy upgrade detection remain green**. The wallet tests drive a mock EIP-1193 provider, which exercises Klyro's own behaviour; they are not a test of the MetaMask extension itself, and no real signature is claimed. See EVIDENCE.md for actual runs and failures found and fixed.


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

[evidence/wallet-deployment.json](evidence/wallet-deployment.json) records a real wallet-shaped deployment of HookRiskRegistry and a real `publish` transaction on local chain 31337, including block, gas, `owner()` read-back and a rejected duplicate publication. [evidence/registry-deployment.json](evidence/registry-deployment.json) is the same contract deployed by `npm run deploy:registry`. Both survive an application restart. [evidence/local-simulation.json](evidence/local-simulation.json) contains local chain-31337 contract addresses and swap receipts. [evidence/proxy-upgrade.json](evidence/proxy-upgrade.json) contains an actual local upgrade. No local address or receipt is presented as a public explorer record.

## Deployment

Use a persistent Node host with a mounted SQLite volume. `npm run build` then `npm start` runs production. The Dockerfile compiles the registry artifact inside the image and keeps `/app/data` as the volume. `docker compose up --build` expects a private .env configuration. Keep the SQLite volume persistent and set APP_ORIGIN before serving the app. [Host options: Render vs Vercel](docs/deployment-hosts.md). Vercel's filesystem is ephemeral, so SQLite history and the scheduler do not survive there.

The background scan worker requires a continuously running Node process. Do not use request-terminating serverless hosting without replacing it with a durable queue. Cloudflare Worker-only hosting does not support the selected node:sqlite runtime. [Deployment details](docs/deployments.md).

## Limits, compliance and disclosure

Read [security limits](docs/security-limitations.md), [passport schema](docs/hook-passport.md), [diff semantics](docs/hook-behavior-diff.md) and [evidence graph](docs/evidence-graph.md). There is no arbitrary transaction endpoint and no AI-generated contract execution.

[FEEDBACK.md](FEEDBACK.md) records genuine developer observations. The separate [Uniswap feedback form](https://developers.uniswap.org/hackathon-feedback) has not been submitted. Participant-specific ratings, Telegram handle, event lane, actual human contributions and terms cannot be invented. Human narration and participant submission remain pending.

[AI assistance disclosure](docs/ai/AI_DISCLOSURE.md) and [prompt provenance](docs/ai/PROMPTS.md). Application code is MIT; dependencies retain their own licenses, including Uniswap's applicable source licenses and Hallmark's MIT license. See THIRD_PARTY_NOTICES.md.
