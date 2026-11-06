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

- [ ] Discovery from real PoolManager Initialize events
- [ ] Registration with real deployment lookup (tx, block, deployer)
- [ ] Reject non-hook contracts explicitly
- [ ] Permission / callback / source / proxy detail surfaces

## Phase 4 — Activity and participants

- [ ] Event ingestion (Swap, ModifyLiquidity, Donate, Initialize, transfers)
- [ ] Dedupe on (chainId, txHash, logIndex)
- [ ] Participant roles with evidence for each
- [ ] Filtering, pagination, historical retrieval

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
