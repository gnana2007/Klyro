# Klyro implementation checklist

Tracks the master development prompt phase by phase. A box is ticked only when the
backend exists, the data is real, tests pass and limitations are documented.

## Baseline (verified 6 Nov 2026, this working tree)

- [x] npm ci (147 packages). Note: harness exports `npm_config_allow_scripts`, which
      npm 12 rejects for project installs; installs run via `env -u npm_config_allow_scripts`.
- [x] npm run typecheck — clean
- [x] npm test — 41 passed
- [x] npm run build — success (Next.js 16.4.5)
- [x] npm run contracts:test — 11 passed (10 registry, 1 simulation)

## Phase 2 — Foundation

- [x] Migration runner backed by the existing `migrations` table (v1 kept, v2 additive)
- [x] Relational core: hooks, activities, participants, graph nodes/edges, scan index state
- [x] Hook identity (chainId + address) with per-chain isolation, tested
- [x] Provider abstraction with timeout/retry/chunked logs/reorg confirmation
- [x] Durable job lifecycle (jobs and stages persisted in SQLite; restart marks unfinished jobs interrupted)

## Phase 3 — Hook investigation

- [x] Discovery from real PoolManager Initialize events (live-verified on Ethereum)
- [x] Registration with real deployment lookup (tx, block, deployer) — implemented; reports UNKNOWN when the RPC cannot serve archival state for old contracts; returns UNKNOWN honestly
- [x] Non-hook contracts reported as NOT_A_HOOK / ADDRESS_ONLY, never assumed
- [x] Permission / callback / source / proxy detail surfaces (Overview → Hook identity)

## Phase 4 — Activity and participants

- [x] Event ingestion: Initialize, Swap, ModifyLiquidity, Donate (live-verified)
- [x] Dedupe on (chainId, txHash, logIndex) — live re-persist inserted 0 duplicates
- [x] Participant roles derived only from observed senders, each with evidence
- [x] Filtering, pagination, historical retrieval (repository layer, tested)

## Phase 5 — Evidence graph

- [x] Evidence-backed nodes/edges persisted per scan (`graph_nodes`/`graph_edges`, `saveGraph`)
- [x] Interactive graph (finding → evidence → observation detail → edge table)
- [x] Provenance navigation (every node shows method, chain, block, timestamp, limits)

## Phase 6 — Historical analysis

- [x] Rescan + immutable history (snapshots are append-only; rescan verified to insert 0 duplicate activities)
- [ ] Monitoring (scheduled rescans are not implemented; scans are user- and operator-triggered)
- [x] Original vs revised comparison (code/config + deployment/hook-status/participants rows)

## Phase 7 — Passport and security

- [x] Passport v2 with participants/activity/completeness (snapshot schema v2)
- [x] Canonical hash + export + verification (independently recalculated in browser)
- [x] Expanded deterministic findings (permission, delta, proxy, source, opcode rules)

## Phase 8 — Integrations

- [ ] CRE (blocked on authenticated CLI unless credentials appear)
- [ ] 0G (blocked on key unless credentials appear)

## Phase 9 — Frontend

- [x] Real API wiring, no fabricated metrics (scanner, identity, activity ledger, diff, evidence graph, passport, registry, verification)

## Phase 10 — Validation

- [x] Full suite + reports (see the verified counts at the end of this file)

## Phase 2 findings and evidence (this tree, 6 Nov 2026)

- `npm_config_allow_scripts` is exported by the harness; npm 12 rejects it for
  project installs. Installs run as `env -u npm_config_allow_scripts npm ci`.
- Installed: 147 packages. Foundry forge/anvil binaries present and executable.
- Baseline re-verified after `npm ci`: typecheck clean, 41 tests, build success,
  11 Foundry tests.
- Bug found and fixed while writing the ledger tests: the activity INSERT listed
  22 columns but bound 21 values, so `created_at` was NULL and `INSERT OR IGNORE`
  silently discarded every row. Placeholder list is now derived from the column
  list, so a dropped value cannot recur. Covered by tests.
- `chains.ts` client return type was widened by the union of viem chain
  definitions and did not satisfy `PublicClient`; `clientFor` now returns the
  shared `KlyroClient` type explicitly.
- Test counts after Phase 2: 57 vitest (41 existing + 4 schema + 12 repository).

## Phase 3/4 evidence (live chain, 6 Nov 2026)

Investigated hook `0x322dcEc4958C14e021A9F1cD49DF11b9457968cC` on Ethereum
through `investigateHook()`:

- block 26356222, code size 10185 bytes, runtime hash
  `0xcd772954...880b2f` (matches the earlier committed live scan).
- permission bitmap 10444, dependencies valid, 6 flags enabled:
  beforeInitialize, beforeAddLiquidity, beforeSwap, afterSwap,
  beforeSwapReturnDelta, afterSwapReturnDelta.
- proxy: direct, resolved. Source: VERIFIED, 33 Sourcify files.
- pool association: POOL_OBSERVED (1 pool in the 200-block window,
  pool id 0xfe1e7c3c...8aa5, currency0 0x8FDDD3B4..., fee 0, tickSpacing 200).
- activity: Initialize + ModifyLiquidity observed at block 26356135,
  tx 0x0b0d424a...fa558, timestamp 2026-11-06T13:33:47Z.
- re-persisting the same investigation inserted 0 duplicate activities.

Independent cross-check of one data point: receipt for that tx reports
`logIndex` values starting at 1639, so the Initialize at logIndex 1640 is
genuinely the second log of the transaction. `logIndex` is block-scoped, not
transaction-array-scoped.

### Blockers found and reported honestly

- Deployment discovery requires archival state. The default public RPC returns
  HTTP 403 "Archive requests require a personal token". The lookup now stops
  on the first archive rejection and reports UNKNOWN with that reason instead
  of probing 40 blocks or inventing a deployer. Providing an authenticated
  archive-capable URL in `RPC_ETHEREUM` resolves it.
- Transport response cap was 8 MB, but one 100-block Swap page is ~2.4 MB and
  a 2,000-block page exceeds 8 MB. Cap raised to 32 MB and log chunk reduced to
  100 blocks, both measured rather than guessed.

## Phase 5–10 completion pass (7 Nov 2026, this working tree)

Snapshot schema advanced to `hscan.snapshot.v2`. The additive fields are
`hookStatus`, `deployment`, `participants` and `activity`. They carry only
what was read from the chain at the pinned block:

- `hookStatus` is `POOL_OBSERVED` only when an Initialize event named this
  address as its `hooks` contract, `NOT_A_HOOK` only when the address bitmap
  is zero, otherwise `ADDRESS_ONLY`. It is never promoted from permissions.
- `deployment` is `UNKNOWN` (with the provider's reason kept in the node
  limitations) whenever archive probing cannot reach creation.
- `participants` each carry the evidence string that justified the role.
- `activity` states its window and, on failure, its reason. A quiet window is
  `PARTIAL`, not "no activity exists".

### New API surface

- `GET /api/hooks/:chain/:address/profile` — hook row, participants (with
  evidence), kind counts, last indexed block.
- `GET /api/hooks/:chain/:address/activity?kind=&fromBlock=&toBlock=&limit=&offset=`
  — paginated, filtered activity plus totals.
- `GET /api/hooks/:chain/:address/history` — unchanged, now explicitly routed.

Relational persistence runs after every saved scan and rebuilds activity rows
from the snapshot's own recorded window, so rows are always traceable to that
observation. Dedupe is on `(chain_id, tx_hash, log_index)`.

### Bugs found in this pass and fixed

- **Activity rows were never written.** The first implementation tried to
  derive them from a summary that does not contain the rows, so a real Ethereum
  scan reported 4 observed events in the snapshot while the table held 0. Now
  re-queried and verified: 4 rows written, and a rescan inserted 0 more.
- **"Origin not allowed" on every POST.** `protect()` pinned the whole origin
  string to `APP_ORIGIN` (default port 3000), so a same-origin request from a
  preview or alternate port was rejected. Now same scheme+host without the port
  is accepted; cross-site origins are still rejected. Added a CSRF guard that
  requires `application/json` on non-GET requests, because a cross-site form
  post can set neither `Origin` to the target nor a JSON content type.
- Version diff did not compare the new facts. `deployment.deployer`,
  `hookStatus` and `participants` rows were added. Unknown deployers compare as
  `inconclusive`, never as `unchanged`.

### Verification in this tree

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 71 passed (7 files) |
| `npm run build` | success (Next.js 16.4.5) |
| `npm run contracts:test` | 11 passed |
| `npm run test:e2e` (desktop + mobile) | 6 passed |
| `npm run simulation` | local Uniswap fixture executed |
| Live Ethereum scan | 4 activity rows, 2 pools, source VERIFIED |
| Live Base scan | invalid flag dependencies → `HOOK-FLAGS` high, no invented participants |

### Still blocked (not claimed as done)

- Actual 0G inference: no `ZERO_G_API_KEY`/`ZERO_G_MODEL` present. Free credits
  only. No request was sent and no request ID exists.
- Chainlink CRE authenticated simulation: the CLI needs login/API key.
  Compilation to WASM succeeds; that is not a successful simulation.
- Public-chain registry publication: no deployed registry address, no
  authorized transaction.
- Scheduled monitoring, public hosting and the narrated video remain open.
