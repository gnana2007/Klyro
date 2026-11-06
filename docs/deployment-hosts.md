# Vercel + Render deployment

Two hosts are supported. Choose one.

## Which one

| Need | Vercel | Render |
| --- | --- | --- |
| Serverless web app | yes | — |
| Persistent SQLite | **no** (ephemeral filesystem) | yes (disk) |
| Background monitoring scheduler | **no** (no long-lived process) | yes |
| Wallet-signed deploy/publish UI | yes | yes |

Klyro writes every scan, activity row, deployment and publication to SQLite and
runs a scheduler inside the Node process. On Vercel those writes disappear at the
next deploy and the scheduler cannot run. **Render (or any host with a disk) is
the supported production target.** Vercel works as a read-mostly preview only if
you accept lost history: set `MONITOR_ENABLED=false` there.

## Render (recommended)

1. New → Web Service → connect `gnana2007/Klyro`.
2. Runtime: Docker (uses the repo `Dockerfile`), or Node with
   - Build: `npm ci && npm run contracts:build && npm run build`
   - Start: `npm start`
3. Add a **Disk** mounted at `/data` (size ≥ 1 GB).
4. Environment:
   - `DATABASE_PATH=/data/klyro.sqlite`
   - `APP_ORIGIN=https://<your-service>.onrender.com`
   - `OPERATOR_TOKEN` = a long random string (required off loopback)
   - `MONITOR_ENABLED=true`
   - `ZERO_G_API_KEY`, `ZERO_G_MODEL` (see `GET /api/ai/models`)
   - `ZERO_G_FREE_CREDITS_CONFIRMED=true` only once credits are usable
   - `REGISTRY_ADDRESS` / `REGISTRY_CHAIN_ID` after you deploy the registry
5. Health check path: `/api/health`.

## Vercel

1. Import the repository; framework preset Next.js.
2. Environment variables as above, plus `MONITOR_ENABLED=false`.
3. `DATABASE_PATH` must point at a mounted volume — Vercel has none, so history
   is lost between deploys. Do not present Vercel data as durable.

## Before you claim a deployment

- `GET /api/health` returns `status: ok`.
- `GET /api/health/live` shows each chain as `available` (it reads chain id and head).
- A scan returns real block-pinned evidence.
- `GET /api/registry/state` reads the owner from the chain you configured.
- A deployment record exists only with a receipt (`status: deployed`).
