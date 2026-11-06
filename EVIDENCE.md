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

All results below were executed locally on 6 November 2026. No production mocks were used.

| Check | Actual outcome | Reproduce / proof |
|---|---|---|
| TypeScript application | Passed | npm run typecheck; production build type-check |
| Unit/regression tests | 40 passed, 0 failed | npm test; evidence/unit-tests.txt |
| Foundry | 11 passed, 0 failed | npm run contracts:test -- -vv; evidence/foundry-tests.txt |
| Desktop/mobile browser journeys | 6 passed, 0 failed | npm run test:e2e; evidence/browser-tests.txt |
| Production build | Passed | npm run build; evidence/production-build.txt |
| Hallmark scanner | 0 FAIL, 0 REFLEX, 0 WARN | evidence/hallmark-check.txt |
| Hallmark public passport | 0 FAIL, 0 REFLEX, 0 WARN | evidence/hallmark-passport-check.txt |
| CRE TypeScript/WASM | Compiled successfully | evidence/cre-compile.txt; official SDK 1.23.0 and Javy compiler |
| CRE CLI simulation | BLOCKED, not successful | evidence/cre-attempt.txt: login/API key required; user chose to leave this blocked |
| Real 0G inference | NOT EXECUTED | No API key/model configured; free credits only authorized |
| Uniswap live Ethereum scan | Passed, source verified by runtime match | evidence/live-hook-scan.json: hook 0x322dcEc4958C14e021A9F1cD49DF11b9457968cC, block 26354677, six pool associations |
| Actual Uniswap local swaps | Passed | evidence/local-simulation.json: baseline 996900609009281774, hook 986931602919188957, fee 9969006090092817 |
| Full local API workflow | Passed | evidence/integration.json: actual scan/rescan, pool association, history, diff, hash, tamper rejection, registry receipt and readback |
| Real proxy upgrade observation | Passed locally | evidence/proxy-upgrade.json: same runtime code, different implementation addresses/hashes |
| Historical authenticity/current check | Both MATCH locally | evidence/verification.json; values are checked against the configured local registry, not a public chain |

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
