# Master requirements and evidence tracker

The complete source specification is docs/MASTER_BUILD_PROMPT.md. This tracker separates implemented code, executed proof, and external completion.

| Final acceptance requirement | State | Proof / remaining work |
|---|---|---|
| Real Uniswap v4 hook analysis | Verified | evidence/live-hook-scan.json; Ethereum PoolManager association and bytecode |
| Correct permission decoding | Verified | Every individual flag, combinations and delta dependency tests |
| Deterministic evidence-linked findings | Verified | src/core/analysis.ts and graph integrity tests |
| Reproducible fingerprint | Verified | Canonical/state/observation tests |
| Historical scan storage | Verified | SQLite regression and live local rescan integration |
| Hook Behavior Diff | Verified | evidence/integration.json and diff tests |
| Proxy/implementation changes handled honestly | Verified | evidence/proxy-upgrade.json, actual local upgrade |
| Interactive Evidence Graph | Implemented and tested | Browser journey tests and captured evidence screenshots; see final execution log |
| Evidence links to actual observations | Verified | Graph validation and actual chain evidence |
| Baseline-versus-hook simulation | Verified locally | Actual PoolManager balances, callbacks, fee and gas in evidence/local-simulation.json |
| Actual 0G inference | Blocked | No API key/model; existing free credits only authorized |
| Actual 0G request IDs visible | Implementation only | Strict actual-ID persistence/UI; no request fabricated |
| Successful Chainlink CRE CLI simulation | Blocked | Login required; user accepted blocked status |
| CRE blockchain + external analysis orchestration | Implementation only | Official SDK workflow; no successful runtime execution claimed |
| HookRiskRegistry tests | Verified | Ten authorization/publication/event/version tests |
| Registry publication path | Verified locally | Actual Anvil publication receipt/readback; CRE/public-chain publication pending |
| Hook Passport generated | Verified | Browser and API integration |
| Report hash independently recalculated | Verified | Browser hash, canonical tests and tamper rejection |
| Authenticity distinguished from current matching | Verified | Separate integrity/registry/current outcomes |
| Public GitHub repository | Allocated | gnana2007/Klyro; push evidence recorded after verification |
| README setup tested | In progress | Actual installed lockfile/build/tests; fresh clone CI follows push |
| FEEDBACK.md complete | Written | Genuine observations recorded |
| Uniswap feedback form submitted | Pending participant | Telegram, personal ratings and terms; no receipt yet |
| Exact integration source references | Documented | README generated references and source links |
| 0G sponsor requirements satisfied | Incomplete | Real request, accessible deployment and narrated video pending |
| Chainlink sponsor requirements satisfied | Incomplete | Successful authenticated CLI simulation pending |
| EVIDENCE.md reproducible proof | Written | Actual commands and committed JSON/text evidence |
| AI disclosure complete | Written | docs/ai/AI_DISCLOSURE.md and PROMPTS.md |
| Meaningful incremental commits | In progress | Phase commits; git history is authoritative |
| Public accessible demo | Pending hosting | Node persistent-disk deployment required; temporary preview if available recorded separately |
| Demo video/event requirements | Pending human | Under three minutes, >=720p, human narration, normal speed; script prepared |

## Operational and engineering constraints

Only selected partners are Uniswap Foundation, 0G and Chainlink. Hosting/design/devtools are infrastructure, not extra prize selections. There are no paid calls, account funding, real wallet-key requirements for scanning, frontend secrets, fabricated requests, fake deployments, or mocked production results. Test fixtures are clearly scoped. Local-chain signing uses only the public Anvil development mnemonic and refuses other chains.

Production is a single persistent Node 24 process, SQLite volume, validated fixed networks and RPCs, Zod inputs, bounded data sizes, origin validation, quotas and operator-protected inference. No unsafe AI-driven transaction execution exists.

The event deadline in the brief is 7 November 2026 at 09:00 IST. Final event/lane eligibility and participant submission must be checked against the official dashboard; no participant eligibility or submission is fabricated. The empty repository's dated initial commit provides an actual baseline.
