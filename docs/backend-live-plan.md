# Live backend plan and setup

## What was failing

On this Windows host, Node's built-in `fetch` timed out on public RPC even though Node native HTTPS and Windows HTTP could reach the same endpoints. The API health response only checked local SQLite, so it looked healthy while live scans failed. The backend now uses a bounded, abortable native HTTP transport for RPC, Sourcify and optional 0G requests. A separate `/api/health/live` checks actual chain IDs and latest block numbers without returning credentials.

## Live data flow

1. Choose Ethereum, Sepolia or Base and enter a deployed hook address. **Load live Ethereum hook** fills a known deployed address; pressing **Scan a hook** still fetches a fresh block. The local fixture is labeled separately.
2. The Node backend checks the RPC chain ID, pins a block, reads bytecode, proxy slots and `owner()` at that block, checks Sourcify runtime matching, and searches a bounded official PoolManager event window.
3. Deterministic analysis and evidence are saved in SQLite. Job status shows each stage and a sanitized failure message. A server restart marks unfinished in-memory jobs interrupted so the UI does not wait forever.
4. A new scan is a fresh observation. History and passports intentionally preserve historical block data. The app does not stream pending transactions or imply constant updates.

## Environment configuration

Copy `.env.example` to ignored `.env.local`. The built-in public RPC URLs need **no API keys** for read-only scans. If a public endpoint is slow or rate limited, set `RPC_ETHEREUM`, `RPC_SEPOLIA` or `RPC_BASE` to a reliable provider HTTPS JSON-RPC URL. Never commit that file. `RPC_LOCAL` is only for the optional Anvil fixture. The backend needs Node 24 and a persistent writable `DATABASE_PATH`.

Check `http://127.0.0.1:3000/api/health/live` for actual network availability. `status: available` includes a live `blockNumber` and `checkedAt`; `unavailable` means the configured RPC needs attention. If the endpoint does not work from your host, provide a working provider URL in `.env.local` and restart the Node server.

0G explanation is optional and separate from the core live scan. To enable it, add your own `ZERO_G_API_KEY` and an account-listed `ZERO_G_MODEL` to `.env.local`, confirm usable **existing free credits**, then set `ZERO_G_FREE_CREDITS_CONFIRMED=true`. The app does not purchase credits. Do not paste keys into chat. 0G requests remain unavailable until those values are configured.

Chainlink CRE authenticated simulation remains blocked until you sign in with the official CLI or configure `CRE_API_KEY` locally. Live scanning does not depend on CRE. Registry publication on a public chain would additionally require a deployed registry and an explicitly authorized transaction; the existing registry is local chain 31337 only.

## Verification

Run `npm run typecheck`, `npm test`, `npm run build`, then start the server and check `/api/health/live`. Submit a new Ethereum scan and confirm its snapshot has a recent block number/hash, matched runtime source when available, and an evidence graph. The backend must not substitute saved fixture data for a live chain scan.
