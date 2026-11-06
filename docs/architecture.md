# Architecture and trust boundaries

The Next.js App Router serves a React investigation workbench and Node.js route handlers. viem reads approved EVM networks. Node 24's built-in SQLite driver stores jobs, immutable snapshots, inference records, immutable passports and executions. Schema migration version 1 is applied in src/server/db.ts. Findings, permissions, observations, graph nodes/edges and diffs are typed JSON aggregates bound to snapshots; they are not disconnected global tables.

A scan records chain ID, block number/hash/timestamp before reading runtime code, EIP-1967 slots, beacon implementation, owner getter and bounded Initialize events at that block. The scan rechecks the block hash before saving. It does not infer hook compatibility from address bits alone. Pool association is confirmed only by observed official PoolManager events.

Deterministic rules consume observations and emit evidence-linked findings. The UI presents an attention index, not a safety score. 0G receives structured evidence with source-body bulk omitted and cannot alter findings. Strict validation rejects unsupported references, extra top-level fields, missing or duplicate finding explanations. Request and output hashes preserve provenance.

Passports copy a snapshot, prior diff and inference reference at creation. No publication fields are mutated into the hashed report afterwards. The separate registry records report/state hashes. CRE validates the API report, compares the scanned block with an EVM-capability read, requires a successful 0G request by default, prepares a report, and optionally calls writeReport.

The application needs a persistent Node server and disk. SQLite background jobs are appropriate for a single-process hackathon demo; horizontal scaling and serverless request termination require a durable job queue and a shared database. Cloudflare Worker-only hosting is not compatible with the selected node:sqlite runtime, so the repository includes a Node container instead of silently changing the requested storage model.
