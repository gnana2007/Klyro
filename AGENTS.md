# HSCAN working rules

Read PLAN.md, EVIDENCE.md and docs/MASTER_BUILD_PROMPT.md. Preserve working code.
Use Node.js 24, TypeScript, Next.js, viem, Zod, SQLite, Foundry, official Uniswap v4 and Chainlink CRE interfaces.
Only selected sponsors: Uniswap Foundation, 0G, Chainlink. Hallmark governs visual craft.
No fabricated chain data, risk findings, request IDs, logs, transactions, deployments or passing checks.
Rules produce findings; AI explains and cannot change their severity or evidence.
Every RPC observation is pinned to a block. Unknown is not false, safe, unchanged or resolved.
Permission bits are address-derived and do not mutate at the same address.
Separate state fingerprints from block-specific observation identities.
Separate historical authenticity from current-version matching. Passports are not safety certificates.
Do not commit credentials, databases, build outputs or provider response bodies containing secrets.
User authorizes 0G free credits only. Never fund or send paid calls without fresh explicit authorization.
Run npm run typecheck, npm test, npm run build and relevant Foundry/integration checks before pushing.
Review git diff before commits. Use meaningful incremental commits. Main push is authorized for gnana2007/Klyro.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
