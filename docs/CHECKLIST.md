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
- [ ] Durable job lifecycle (no silent in-memory-only work)

## Phase 3 — Hook investigation

- [x] Discovery from real PoolManager Initialize events (live-verified on Ethereum)
- [ ] Registration with real deployment lookup (tx, block, deployer) — blocked on archive RPC for old contracts; returns UNKNOWN honestly
- [x] Non-hook contracts reported as NOT_A_HOOK / ADDRESS_ONLY, never assumed
- [ ] Permission / callback / source / proxy detail surfaces

## Phase 4 — Activity and participants

- [x] Event ingestion: Initialize, Swap, ModifyLiquidity, Donate (live-verified)
- [x] Dedupe on (chainId, txHash, logIndex) — live re-persist inserted 0 duplicates
- [x] Participant roles derived only from observed senders, each with evidence
- [x] Filtering, pagination, historical retrieval (repository layer, tested)

## Phase 5 — Evidence graph

- [ ] Evidence-backed nodes/edges persisted per scan
- [ ] Interactive graph (zoom, pan, filter, expand)
- [ ] Provenance navigation

## Phase 6 — Historical analysis

- [ ] Rescan + immutable history
- [ ] Monitoring
- [ ] Original vs revised comparison incl. source diff

## Phase 7 — Passport and security

- [ ] Passport v2 with participants/activity/completeness
- [ ] Canonical hash + export + verification
- [ ] Expanded deterministic findings

## Phase 8 — Integrations

- [ ] CRE (blocked on authenticated CLI unless credentials appear)
- [ ] 0G (blocked on key unless credentials appear)

## Phase 9 — Frontend

- [ ] Real API wiring, no fabricated metrics

## Phase 10 — Validation

- [ ] Full suite + reports

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
