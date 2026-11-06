# Execution evidence

Only actual executions belong here. Integration code and integration success are separate states.

## Initial inspection — 6 November 2026

- Local repository empty; no commits. Remote gnana2007/Klyro public, empty, default main.
- GitHub connector profile gnana2007; repository push permission true.
- Node v24.18.0, npm 12.0.2, Python 3.14.6.
- forge, anvil, cre, bun not initially on PATH.
- No configured 0G key/model or registry deployment found. Environment values were never printed.
- Hallmark installed and its theme tool executed successfully. Console selected after reviewing the three dealt references.

## Verification

All results below were executed locally on 6–7 November 2026. No production mocks were used.

| Check | Actual outcome | Reproduce / proof |
|---|---|---|
| TypeScript application | Passed | npm run typecheck; production build type-check |
| Unit/regression tests | 71 passed, 0 failed | npm test; evidence/unit-tests.txt |
| Foundry | 11 passed, 0 failed | npm run contracts:test -- -vv; evidence/foundry-tests.txt |
| Desktop/mobile browser journeys | 6 passed, 0 failed | npm run test:e2e; evidence/browser-tests.txt |
| Production build | Passed | npm run build; evidence/production-build.txt |
| Hallmark scanner | 0 FAIL, 0 REFLEX, 0 WARN | evidence/hallmark-check.txt |
| Hallmark public passport | 0 FAIL, 0 REFLEX, 0 WARN | evidence/hallmark-passport-check.txt |
| CRE TypeScript/WASM | Compiled successfully | evidence/cre-compile.txt; official SDK 1.23.0 and Javy compiler |
| CRE CLI simulation | BLOCKED, not successful | evidence/cre-attempt.txt: login/API key required; user chose to leave this blocked |
| Real 0G inference | NOT EXECUTED | No API key/model configured; free credits only authorized |
| Uniswap live Ethereum scan | Passed, source verified by runtime match | evidence/live-hook-scan.json: hook 0x322dcEc4958C14e021A9F1cD49DF11b9457968cC, block 26354677, six pool associations |
| Live investigation facts (Ethereum) | 4 activities, 2 pools, hookStatus POOL_OBSERVED | evidence/investigation-facts.json, block 26356361 |
| Activity persistence and dedupe | 4 rows written; rescan inserted 0 | GET /api/hooks/1/…/activity before and after rescan |
| Live Base scan (honest-unknown path) | Passed | 0xb200…ce01: no pool in window → ADDRESS_ONLY, HOOK-FLAGS high, zero participants |
| Actual Uniswap local swaps | Passed | evidence/local-simulation.json: baseline 996900609009281774, hook 986931602919188957, fee 9969006090092817 |
| Full local API workflow | Passed | evidence/integration.json: actual scan/rescan, pool association, history, diff, hash, tamper rejection, registry receipt and readback |
| Real proxy upgrade observation | Passed locally | evidence/proxy-upgrade.json: same runtime code, different implementation addresses/hashes |
| Historical authenticity/current check | Both MATCH locally | evidence/verification.json; values are checked against the configured local registry, not a public chain |

## Second pass — investigation surfaces (7 November 2026)

Implemented: snapshot v2 investigation facts, hook identity and participant
panels, a paginated activity ledger backed by SQLite, and diff rows for the new
facts. Verified `npm run typecheck`, 71 unit tests, 11 Foundry tests, production
build and 6 desktop/mobile browser journeys against the production server.

Failures found and fixed in this pass:

- Activity rows were never written to SQLite although the snapshot reported 4
  observed events (count read 0). The rows are now re-queried from the
  snapshot's recorded window; verified 4 written and 0 added on rescan.
- Every POST from the app was rejected with "Origin not allowed" whenever the
  app was served on a port other than APP_ORIGIN. Same scheme+host now matches
  on any port; a CSRF content-type requirement was added at the same time.
- The version diff ignored the new facts. Added `deployment.deployer`,
  `hookStatus` and `participants`, with UNKNOWN deployers comparing as
  `inconclusive`.

## Failures found and fixed

- Sandbox subprocess restrictions prevented initial Vitest/Next/Foundry execution. Scoped execution access resolved this; no sandbox/security settings were weakened.
- Foundry initially rejected imports outside the contracts directory. Explicit allow_paths and official dependency mappings fixed it. The project runner propagates the native executable's exit status.
- A real scan exposed a SQLite placeholder-count bug. It was fixed and covered by a database regression test and actual scan integration.
- The UI test found a race while loading the actual local fixture. A loading/disabled state and condition-based browser assertion fixed it.
- Hallmark identified spacing-token, field-contrast, narrow-control and passport-header issues. Those were fixed and confirmed by render checks.
- CRE compilation first needed the local Bun directory on PATH and an exported main function. The final workflow compiled to WASM successfully. This does not turn the blocked CLI simulation into a success.

## Deployment and submission limits

The production app runs on http://127.0.0.1:3000. This is local access only. No public hosting or public-chain registry deployment is claimed.
Automatic approval review rejected publishing a temporary public Cloudflare tunnel because the action would expose the local app and persisted reports at a public URL. No tunnel was started; no workaround was attempted. Specific publication approval remains pending.
Browser automation stopped because the Windows tool could not verify the active Chrome URL. No account/credential operation was performed.
The Uniswap participant form and human-narrated video remain pending. Prepared feedback and a demo script are included; no submission receipt or video is fabricated.

The full checklist remains in docs/requirements.md. Git history and the verified remote ref, after push, are the source of truth for publication.

## Third pass — wallet deployment, 0G truth check (7 November 2026)

Inspected the live configuration without printing any credential. 0G model
catalog read (HTTP 200, 125 models); the configured `ZERO_G_MODEL` is the literal
text `id`, which is not in the catalog, and a real inference request returned
HTTP 402 `pay_no_balance` ("Add funds to keep using services."). No inference
result is claimed. The diagnosis was corrected so an empty account is no longer
reported as a model problem, and `/api/ai/models` now reports account state.

Failures found and fixed in this pass:

- A production build on loopback refused every costly POST with HTTP 503
  ("Set OPERATOR_TOKEN…") because the token was demanded unconditionally. It is
  now required only for a public `APP_ORIGIN` or a public browser Origin, so a
  single-operator local run works and a public host is still gated.
- `/api/passports/<id>/publication-intent` returned the whole passport instead of
  the five publish fields, producing `Cannot convert undefined to a BigInt` in
  the publishing client. It is now matched before the plain passport route and
  returns the flattened intent.
- The Dockerfile never compiled the Solidity artifact, so the deploy endpoints
  would fail in a container. It now runs `contracts:build` and copies
  `contracts/out` into the runtime image.
- The operator page duplicated the wallet status and left an empty band above the
  panels; screenshot review caught it and both were removed.

Executed in this pass:

| Check | Actual outcome |
|---|---|
| TypeScript | Passed |
| Unit/regression tests | 101 passed, 0 failed |
| Foundry | 11 passed, 0 failed |
| Desktop/mobile browser journeys | 12 passed, 0 failed |
| Production build | Passed |
| Wallet deployment on Anvil | Receipt success, codeSize 2001, `owner()` matches deployer |
| Wallet publication on Anvil | `status: published`, gas 161712, read-back MATCH |
| Duplicate publication | Reverted on chain (asserted) |
| Persistence across restart | 1 deployment and 1 publication still present |
| Registry state read live | owner and codeSize read from the chain at a named block |
| Passport verification | integrity MATCH, authenticity REGISTRY_MATCH |
| Chain reachability | Ethereum, Sepolia, Base and Anvil all answered |

Not claimed: a public testnet deployment, authenticated CRE simulation, or any
0G inference output. See evidence/wallet-deployment.json and
evidence/registry-deployment.json (both chain 31337).

## Editorial product redesign — 7 November 2026

- Audited Next.js routes, client workbench, typed APIs, Node SQLite worker, live viem scans, evidence/diff/passport models, Solidity registry, CRE workflow and 0G gating before editing. The later remote wallet and operator integration was preserved during the merge.
- Added an architectural editorial landing page and `/app` workspace; legacy root query links redirect. Reused the actual scan, history, diff, evidence, passport, simulation, registry and health APIs. The workbench groups history by chain/address and computes overview counts only from returned saved records.
- Ran `npm run typecheck`, `npm test` (**41 passed**), `npm run contracts:test -- -vv` (**11 passed**), `npm run build` (**passed**) and `npm run test:e2e` (**10 desktop/mobile journeys passed**, including actual local-chain scan, evidence, passport and comparison navigation).
- Hallmark source and render checks passed with **0 FAIL / 0 WARN** for landing, dashboard, comparison, scanner and saved passport. One named-look waiver records the exact user-specified palette and serif. Initial mobile overflow, low-contrast labels and navigation test failures were fixed before the final checks.
- A fresh read-only Ethereum scan completed through the unchanged API: hook `0x322dcEc4958C14e021A9F1cD49DF11b9457968cC`, block `26358991`, verified source, all 14 permission flags, two deterministic findings. The UI does not substitute this record for later scans.
- Optional 0G and authenticated CRE statuses remain pending as documented above. No key, credit, transaction or publication success was invented.


## Fresh-checkout CI

GitHub Actions run https://github.com/gnana2007/Klyro/actions/runs/42192091905 completed successfully for c3c13341f5cef1eb43c8524718b153eb935bc964. The fresh Linux runner completed npm ci, type checks, 40 unit tests, production build, 11 Foundry tests, CRE WASM compilation, local simulation and six browser tests. Later commits are independently checked by the same workflow; the live Actions status is authoritative.
