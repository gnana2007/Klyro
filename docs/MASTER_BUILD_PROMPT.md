# HSCAN — MASTER BUILD PROMPT
## Evidence-Driven Uniswap v4 Hook Intelligence, Behavioral Diff & Verifiable Security Passport

You are the principal software architect, senior full-stack engineer, Web3 engineer, smart contract security engineer, AI integration engineer and technical lead responsible for building Hookscan.

You are working on a time-constrained ETHGlobal Mumbai 2026 hackathon submission.

Your responsibility is to build a complete, functional, open-source application with real blockchain integrations, reproducible analysis, meaningful sponsor integrations and a polished demonstration.

Do not merely generate code snippets, plans or frontend mockups.

You must inspect the repository, make implementation decisions, create and modify files, install necessary dependencies, run tests, fix errors and continuously verify the application.

Do not claim functionality that has not actually been implemented and tested.

---

# 1. PRODUCT VISION

Product: Hscan

Tagline:

**Know what a hook does. See what changed. Verify what you trust.**

Product category: Uniswap v4 Security Intelligence Platform.

## Problem

Uniswap v4 introduces customizable liquidity pool behavior through Hooks.

These Hooks are smart contracts that can execute custom logic during pool operations.

While this creates flexibility, it also introduces security and transparency challenges.

Developers, liquidity providers and users need to understand:

- What permissions a hook has.
- What its implementation actually does.
- Whether its behavior creates unexpected risks.
- What changed between two scans.
- Whether previous security findings remain relevant.
- Whether a shared security report represents genuine analysis.
- Whether the report has been altered or the analyzed contract has changed.

Existing tools already provide portions of hook discovery, security analysis and permission decoding.

Do not position Hookscan as the first hook scanner.

Our product differentiation is the combination of:

1. Change-aware hook security intelligence.
2. Evidence-linked behavioral analysis.
3. Reproducible and independently verifiable security passports.
4. Evidence-grounded AI explanations.
5. Blockchain-orchestrated report publication.

## Core product statement

Hookscan transforms one-time smart contract scanning into continuous, evidence-driven security intelligence for Uniswap v4 Hooks.

It answers three questions:

1. What can this hook do?
2. What does this hook actually do?
3. What changed, and can I independently verify the evidence?

---

# 2. STRICT SPONSOR SELECTION

Only select these three partners:

1. Uniswap Foundation
2. 0G
3. Chainlink

Do not add integrations for other sponsors.

Do not integrate unrelated products simply to increase the number of technologies used.

Every sponsor technology must perform an essential function in the product.

## Sponsor 1 — Uniswap Foundation

Selected integration: Build with Uniswap.

Use the Uniswap v4 Hooks ecosystem as the central protocol integration.

Requirements:

- Real integration with Uniswap v4.
- Actual hook permission decoding.
- Official Uniswap contracts, interfaces and SDKs where appropriate.
- Open-source public GitHub repository.
- FEEDBACK.md in repository root.
- Complete the official Uniswap Developer Feedback Form and submit the link to FEEDBACK.md.
- README must point to relevant contracts and precise source-code lines proving integration.

Do not assume that simply mentioning Uniswap or displaying its logo qualifies.

Required resources to inspect:

- https://docs.uniswap.org/
- https://docs.uniswap.org/contracts/v4/overview
- https://docs.uniswap.org/contracts/v4/guides/hooks/your-first-hook
- https://docs.uniswap.org/sdk/v4/overview
- https://developers.uniswap.org/hackathon-feedback

Verify the current official documentation before selecting SDK versions or interfaces.

## Sponsor 2 — 0G

Selected integration: Build with 0G Private Computer.

0G must perform an important function in the primary user workflow.

Mandatory requirements:

- Real 0G Private Computer inference.
- Actual request IDs.
- A usable application that judges can access.
- A repeat-use reason.
- An explicit explanation of what functionality breaks or becomes unavailable without 0G.
- Video under three minutes.
- Public repository, setup documentation and live demo.

No generic AI chatbot.

No removable AI integration.

No fake request IDs.

Do not replace failed 0G inference with fabricated successful responses.

Study:

- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview.md
- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution
- https://pc.0g.ai/
- https://docs.0g.ai/

Check SDK compatibility, supported runtime, authentication, request formats, payment requirements and verification support.

### Why 0G is essential

Hookscan creates security reports that can be repeatedly regenerated when contract behavior changes.

0G processes structured evidence and produces an independently identifiable AI inference request.

Without 0G, Hookscan loses its integrated private, verifiable inference workflow and the corresponding inference evidence attached to each report.

Do not claim that privacy or verifiability is guaranteed unless the selected 0G execution mode actually provides it.

## Sponsor 3 — Chainlink

Selected integration: Best workflow with CRE.

Use Chainlink Runtime Environment as an actual orchestration layer.

Mandatory requirements:

- Connect at least one blockchain with an external API, data source, system, LLM or AI agent.
- Meaningfully orchestrate the Hookscan analysis workflow.
- Successfully execute CRE CLI simulation or live deployment.
- Preserve successful simulation logs or deployment evidence.

Resources:

- https://docs.chain.link/cre
- https://docs.chain.link/cre-templates
- https://ethglobal.com/events/mumbai/prizes/chainlink

Do not integrate CCIP merely for sponsor count. Our selected Chainlink track is CRE.

---

# 3. CORE PRODUCT ARCHITECTURE

Build a modular architecture.

Preferred stack:

Frontend:
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- wagmi where necessary
- viem

Backend:
- Node.js
- TypeScript
- Next.js API routes or a separate service only if justified
- Zod
- SQLite
- Drizzle ORM if appropriate

Blockchain:
- Solidity
- Foundry
- Anvil
- Uniswap v4-core
- Uniswap v4-periphery and official interfaces as required
- viem

AI:
- 0G Private Computer SDK

Orchestration:
- Chainlink CRE SDK and CLI

Testing:
- Vitest
- Foundry tests
- Integration tests
- Playwright if useful

Prefer minimal dependencies and avoid unnecessary infrastructure.

Before implementing any external SDK:

1. Inspect its official documentation.
2. Confirm its current package name.
3. Confirm compatible versions.
4. Confirm runtime and operating system requirements.
5. Inspect official examples.
6. Verify actual method signatures.
7. Create a small integration test before integrating it into the application.

Never invent SDK methods or API endpoints.

---

# 4. CENTRAL FEATURE A — HOOK BEHAVIOR DIFF

This is a primary differentiator.

Build a version-aware security analysis system that compares historical and current hook observations.

## User journey

1. User enters a hook address and chain.
2. Hookscan performs the first scan.
3. The report is stored as a historical snapshot.
4. User rescans the same hook later.
5. Hookscan retrieves current contract information.
6. The comparison engine compares both snapshots.
7. The application generates a structured behavior-difference report.
8. Changed findings are highlighted.
9. Previous findings are marked as unchanged, resolved, worsened, newly observed or requiring reassessment.

## Information to compare

A. Contract changes:
- Runtime bytecode hash.
- Contract code size.
- Proxy indicators.
- Resolved implementation address where reliably supported.
- Implementation bytecode hash where available.

B. Uniswap permission changes:
- Permission bitmap.
- Individual callback flags.
- Return-delta permissions.
- Permission exposure changes.

C. Contract behavior indicators:
- Newly observed external contract dependencies.
- Changed external dependencies.
- Newly detected privileged functions.
- Changed admin-control indicators.
- Relevant callback implementation changes where verified source or reliable analysis permits.

D. Security findings:
- New findings.
- Resolved findings.
- Severity changes.
- Evidence changes.
- Findings requiring reassessment.

## Important implementation details

Never assume that a proxy's runtime bytecode changing is the only way its implementation can change.

Detect common proxy patterns and distinguish:

- Direct deployment.
- EIP-1967 proxy.
- Beacon proxy.
- Minimal proxy.
- Unknown or unresolved proxy.

Use supported on-chain storage reads and implementation-resolution techniques.

If implementation resolution is unavailable, explicitly show UNKNOWN.

Distinguish:

- Direct bytecode change.
- Implementation change.
- Permission change.
- Observed behavior change.
- Inconclusive change.

A changed bytecode hash does not automatically mean malicious behavior.

Do not claim full semantic equivalence or semantic differences from a hash comparison.

## Hook Diff report

Display:

- Previous scan timestamp and block.
- Current scan timestamp and block.
- Previous and current code hashes.
- Permission changes.
- Implementation changes.
- New dependencies.
- Finding changes.
- Evidence for every change.
- Confidence and detection limitations.
- Recommended reassessment actions.

Provide a clear side-by-side comparison.

Include an actual scan history page.

Persist historical snapshots in SQLite.

Add a reproducible diff algorithm and tests.

---

# 5. CENTRAL FEATURE B — EVIDENCE GRAPH

This is another primary differentiator.

Do not display isolated AI-generated security findings.

Build a structured evidence graph connecting the reason for a finding to the underlying observations.

## Graph structure

Create typed nodes:

- Hook
- Contract
- Permission
- Callback
- Code observation
- External dependency
- Admin mechanism
- Simulation scenario
- Simulation result
- Balance change
- Risk finding
- AI explanation
- Report
- Historical change

Create typed relationships:

- HAS_PERMISSION
- ENABLES_CALLBACK
- IMPLEMENTS_CALLBACK
- CALLS_EXTERNAL
- CONTROLLED_BY
- TESTED_BY
- PRODUCED_RESULT
- SUPPORTS_FINDING
- CONTRADICTS_FINDING
- EXPLAINED_BY
- CHANGED_FROM
- INCLUDED_IN_REPORT

## Example

Permission:
afterSwapReturnDelta

↓

Code evidence:
Relevant callback implementation.

↓

Simulation:
Controlled swap produces an observed return-delta or balance difference.

↓

Risk finding:
Potential unexpected token accounting behavior.

↓

AI explanation:
An explanation referencing the exact evidence identifiers.

This is an illustrative investigation path, not an automatic vulnerability claim.

## Graph interaction

Users must be able to:

- Click a risk finding.
- See the evidence supporting it.
- Navigate to the related permission.
- Inspect relevant code observations.
- Open the corresponding simulation result.
- See contradictory or missing evidence.
- Understand why a severity was assigned.

Use an appropriate graph visualization library only if needed.

Keep the visualization interactive, responsive and performant.

## Evidence requirements

Every finding must have:

- Finding ID.
- Category.
- Severity.
- Confidence.
- Status.
- Evidence references.
- Source type.
- Chain ID.
- Block number when applicable.
- Timestamp.
- Detection method.
- Explanation.
- Limitations.

Evidence status must distinguish:

- OBSERVED
- SIMULATED
- ESTIMATED
- UNKNOWN

Do not treat an AI-generated explanation as independent proof.

The deterministic analysis engine is the source of structured findings. The AI explains those findings.

Build graph consistency tests to ensure every displayed finding can be traced to supporting evidence.

---

# 6. CENTRAL FEATURE C — REPRODUCIBLE HOOK PASSPORT

Every completed scan should generate a version-specific Hook Passport.

This is not a safety certification.

It is a verifiable record of the analysis performed at a particular chain state.

## Passport information

Display:

1. Hook address.
2. Chain ID and network.
3. Scan timestamp.
4. Block number.
5. Runtime bytecode hash.
6. Resolved implementation information where available.
7. Uniswap permission bitmap.
8. Risk findings.
9. Evidence graph.
10. Simulation results.
11. Hook fingerprint.
12. Previous-versus-current diff.
13. 0G request ID.
14. 0G verification evidence where available.
15. Report hash.
16. CRE workflow evidence.
17. Registry publication transaction.
18. Registry contract address.
19. Registry verification status.

## Reproducible fingerprint

Create a deterministic fingerprint based on a canonical representation of:

- Chain ID.
- Hook address.
- Runtime bytecode hash.
- Relevant implementation hash or explicit unresolved state.
- Permission bitmap.
- Analysis engine version.

Include the scan block in the report identity and fingerprint design according to a clearly documented versioned schema.

Use a canonical serialization format.

Use keccak256 or another justified cryptographic hash implementation.

Create unit tests proving that:

- Identical inputs generate identical fingerprints.
- A changed bytecode hash changes the fingerprint.
- A changed permission bitmap changes the fingerprint.
- A changed analysis version changes the fingerprint.
- Different chain IDs generate different fingerprints.

## Report hash

Build a canonical report serialization.

Exclude nondeterministic UI fields.

Specify which timestamps, inference references and evidence references are included.

Calculate a cryptographic hash over the canonical report.

Persist the original report.

## Verification

Create a public verification page.

Users should be able to:

1. Open a passport URL.
2. Retrieve its report.
3. Recalculate its report hash.
4. Compare the result against the published registry record.
5. Verify the hook's current code fingerprint against the scanned fingerprint.
6. See whether the report is valid, modified, outdated or unverifiable.

Important:

A report can remain historically authentic even when the hook has subsequently changed.

Display these two questions separately:

- Is this report authentic?
- Does the current contract still match the analyzed version?

Do not confuse them.

---

# 7. UNISWAP V4 ANALYSIS ENGINE

Implement real protocol-specific analysis.

## Address and chain validation

- Validate EVM addresses.
- Validate supported networks.
- Retrieve chain ID.
- Retrieve bytecode.
- Reject addresses without deployed code.
- Record scan block.
- Record block timestamp.
- Handle RPC failures.

Do not identify an arbitrary contract as a valid deployed Uniswap hook solely because its address contains permission bits.

Check the actual Uniswap v4 compatibility requirements.

Where possible, verify hook compatibility with the relevant PoolManager and deployed pool context.

## Permission decoder

Implement accurate Uniswap v4 permission decoding.

Use official Uniswap definitions as the source of truth.

Decode all 14 permission bits, including:

- BEFORE_INITIALIZE_FLAG
- AFTER_INITIALIZE_FLAG
- BEFORE_ADD_LIQUIDITY_FLAG
- AFTER_ADD_LIQUIDITY_FLAG
- BEFORE_REMOVE_LIQUIDITY_FLAG
- AFTER_REMOVE_LIQUIDITY_FLAG
- BEFORE_SWAP_FLAG
- AFTER_SWAP_FLAG
- BEFORE_DONATE_FLAG
- AFTER_DONATE_FLAG
- BEFORE_SWAP_RETURNS_DELTA_FLAG
- AFTER_SWAP_RETURNS_DELTA_FLAG
- AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG
- AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG

Check exact official constants before implementation.

Explain each permission in understandable language.

Test every individual flag and combinations of flags.

## Contract analysis

Inspect:

- Runtime bytecode.
- Bytecode hash.
- Code size.
- Verified source availability.
- Proxy indicators.
- External call indicators.
- Privileged administration indicators.
- Upgradeability.
- Relevant callback implementations where source is available.

Do not pretend to have source code when only bytecode exists.

Do not claim to identify all external dependencies through incomplete bytecode pattern matching.

Use explicit UNKNOWN results where necessary.

## Pool context

Retrieve pool information where supported.

Distinguish a hook contract from a registered or initialized pool using that hook.

Where possible, retrieve:

- PoolManager.
- Pool key.
- Token0 and token1.
- Fee.
- Tick spacing.
- Hook address.

If a pool association cannot be established, say so.

---

# 8. DETERMINISTIC RISK ENGINE

Build an explainable rule-based risk engine.

Inspect:

- Uniswap hook permission exposure.
- Return-delta permissions.
- Unverified source.
- Proxy and upgradeability.
- Privileged administration.
- External contract interactions.
- Relevant token accounting operations.
- Historical fingerprint changes.

Every finding must have:

- Unique ID.
- Rule ID.
- Severity.
- Confidence.
- Explanation.
- Evidence references.
- Detection status.
- Recommended investigation.
- Analysis version.

Do not produce arbitrary AI-generated risk scores.

Implement deterministic scoring with documented weights and deductions.

Clearly separate:

- Protocol capabilities.
- Security indicators.
- Observed behavior.
- Confirmed vulnerabilities.

A hook with many permissions is not automatically malicious.

A verified contract is not automatically safe.

An unverified contract is not automatically malicious.

Do not claim a full security audit or formal verification.

---

# 9. CONTROLLED BEHAVIORAL SIMULATION

Use Foundry and Anvil.

Create a local testing environment using actual Uniswap v4 contracts and appropriate fixtures.

Implement reproducible test scenarios.

At minimum:

1. Baseline pool swap.
2. Hook-enabled pool swap.
3. Before/after swap callback observation.
4. Return-delta behavior where supported.

Capture:

- Scenario ID.
- Hook address.
- Test configuration.
- Input token amounts.
- Output token amounts.
- Before/after balances.
- Return values.
- Gas usage.
- Revert reason.
- Logs.
- Execution result.

Compare baseline versus hook-enabled behavior.

Make it clear that local fixture simulation is not production-chain execution.

Save actual test outputs and scenario configurations.

Add Foundry tests.

---

# 10. 0G PRIVATE COMPUTER INTEGRATION

Implement actual inference in the primary scan workflow.

Do not create a disconnected AI chatbot.

## Inference input

Provide structured evidence:

- Hook metadata.
- Permission flags.
- Deterministic findings.
- Code observations.
- External dependencies.
- Simulation results.
- Historical changes.
- Evidence identifiers.

Avoid sending unnecessary private data.

## Required AI output

Use strict structured JSON.

The response should contain:

- Executive summary.
- Technical explanation.
- Explanation per finding.
- Relevant evidence IDs.
- Potential impact.
- Confidence.
- Missing evidence.
- Recommended further investigation.
- Explicit limitations.

Validate every response using Zod.

Reject malformed or unsupported evidence references.

AI must not invent vulnerabilities, transaction hashes or execution results.

AI cannot modify deterministic risk findings.

## Persist actual evidence

Store:

- Provider.
- Model where available.
- Request ID.
- Request timestamp.
- Response status.
- Input hash.
- Output hash.
- Verification evidence where available.
- Error information.

Display actual request IDs in the Hook Passport.

If inference fails, show a visible failure state.

Do not silently substitute fabricated results.

## Why 0G is necessary

Hookscan repeatedly explains evolving security evidence after rescans and behavior changes.

0G provides the private/verifiable inference execution path and associated request evidence for those explanations.

Without this integration, the product loses that execution and verification capability.

Make this dependency visible in the UI and README.

Investigate whether 0G Storage is appropriate for preserving immutable evidence records. Only implement it if the official SDK and available time support a real integration.

Do not add unnecessary storage integrations just for appearance.

---

# 11. CHAINLINK CRE ORCHESTRATION

Implement a meaningful Chainlink CRE workflow.

CRE must connect:

1. An EVM blockchain.
2. Hookscan's analysis API.
3. 0G inference or its actual result endpoint.
4. Report validation.
5. On-chain registry publication.

Use supported CRE SDK capabilities.

Do not invent CRE APIs.

## Workflow

1. Receive a scan or publication trigger.
2. Read the required EVM contract information.
3. Retrieve or call the Hookscan analysis API.
4. Validate the structured report.
5. Retrieve the report hash.
6. Confirm required evidence references.
7. Prepare registry publication.
8. Execute the supported on-chain write path.
9. Return verifiable execution evidence.

## HookRiskRegistry.sol

Create a registry contract with:

- Hook address.
- Chain ID.
- Fingerprint hash.
- Report hash.
- Risk level.
- Publication timestamp.
- Authorized publisher.

Include:

- Access control.
- Publisher authorization.
- Events.
- Duplicate publication handling.
- Update/version behavior.
- Appropriate validation.
- Tests.

The registry must not imply that publication means the hook is safe.

## CRE evidence

Preserve:

- Workflow identifier.
- Simulation logs.
- Workflow execution result.
- Relevant blockchain reads.
- API response evidence.
- Report hash.
- Registry transaction hash when actually submitted.
- Registry contract address.

Successful CLI simulation is mandatory.

Live deployment is not mandatory if simulation satisfies the selected track.

Never invent transaction hashes or deployment addresses.

---

# 12. FRONTEND AND USER EXPERIENCE

Build a polished, responsive application.

Design direction:

- Minimal.
- Technical.
- Professional.
- Strong typography.
- Neutral background.
- Subtle accent colors.
- Clear information hierarchy.
- No excessive gradients.
- No generic AI dashboard appearance.
- No unnecessary decorative cards.

## Required pages

### A. Landing page

Explain:

- What Uniswap v4 Hooks are.
- Why hook transparency matters.
- What Hookscan does.
- The three main differentiators.
- Sponsor technology integrations.

Main CTA: Scan a Hook.

### B. Scanner

Allow users to:

- Enter hook address.
- Select network.
- Validate address.
- Start scan.
- See actual progress.
- Inspect errors.

### C. Hook overview

Show:

- Address.
- Network.
- Bytecode hash.
- Permissions.
- Contract characteristics.
- Risk summary.
- Scan timestamp.

### D. Behavior Diff

Show:

- Scan history.
- Version comparison.
- Changed permissions.
- Changed implementation.
- New findings.
- Resolved findings.
- Changes requiring reassessment.

### E. Evidence Graph

Build an interactive graph.

Users must be able to navigate between findings and supporting evidence.

### F. Simulation

Show baseline and hook-enabled scenarios.

Display actual test results.

### G. 0G explanation

Show structured explanations and actual inference request status.

### H. Hook Passport

Show all report and verification information.

### I. Public verification page

Allow anyone with the passport URL to verify report authenticity and current contract matching.

### J. Registry

Display published reports and actual registry records.

All interfaces must work on desktop and mobile.

Do not display fake activity or fabricated data in the main application.

---

# 13. DATA MODEL

Use SQLite initially.

Design migrations and typed schemas.

Create tables or equivalent models for:

- Hooks.
- ScanSnapshots.
- ContractObservations.
- PermissionSnapshots.
- RiskFindings.
- EvidenceNodes.
- EvidenceEdges.
- SimulationScenarios.
- SimulationResults.
- HookDiffs.
- AIRequests.
- HookPassports.
- RegistryPublications.
- CREExecutions.

Support historical scans.

Use stable IDs.

Make all persisted records traceable to the relevant scan.

---

# 14. API DESIGN

Create typed APIs using Zod validation.

Suggested routes:

POST /api/scans
GET /api/scans/:id
GET /api/hooks/:chainId/:address
GET /api/hooks/:chainId/:address/history
POST /api/hooks/:chainId/:address/diff
GET /api/diffs/:id
GET /api/evidence/:scanId
GET /api/simulations/:scanId
POST /api/ai/explain
GET /api/ai/requests/:id
POST /api/passports
GET /api/passports/:id
GET /api/verify/:passportId
POST /api/registry/publish
GET /api/registry/:chainId/:address
POST /api/cre/trigger

Adapt these routes if a better architecture is justified.

Do not implement unused endpoints.

Protect all secrets on the server.

Validate all external input.

Implement reasonable rate limits and error handling.

---

# 15. TESTING AND SECURITY

Frontend:
- Component tests.
- API tests.
- User journey tests.
- Responsive checks.

Backend:
- Zod validation.
- Risk engine unit tests.
- Fingerprint tests.
- Diff engine tests.
- Evidence graph integrity tests.
- Report hash tests.

Foundry:
- Registry authorization.
- Publication.
- Updates.
- Invalid inputs.
- Event emission.
- Hook simulation.

Sponsor integration:
- Real 0G request.
- Actual request ID persistence.
- CRE CLI simulation.
- Actual registry publication path.

Security:
- No committed secrets.
- No private keys in frontend.
- No fabricated blockchain data.
- No fabricated inference responses.
- No arbitrary transaction execution.
- No unsafe AI-generated contract execution.
- No misleading safety certification.

---

# 16. DOCUMENTATION AND REQUIRED FILES

Create and maintain:

README.md
AGENTS.md
PLAN.md
FEEDBACK.md
EVIDENCE.md

docs/architecture.md
docs/security-limitations.md
docs/deployments.md
docs/ai/AI_DISCLOSURE.md
docs/ai/PROMPTS.md
docs/sponsors/uniswap.md
docs/sponsors/0g.md
docs/sponsors/chainlink.md
docs/hook-behavior-diff.md
docs/evidence-graph.md
docs/hook-passport.md

README must include:

- Problem statement.
- Product solution.
- Architecture.
- Technologies.
- Setup.
- Environment variables.
- Running instructions.
- Test commands.
- Deployment instructions.
- Actual sponsor integration explanations.
- Exact source-code locations and line references.
- Demo URL.
- Video URL.
- Contract addresses.
- Transaction hashes.
- Known limitations.
- AI disclosure.
- Open-source license.

Never put fictional deployment information in README.

FEEDBACK.md must document genuine Uniswap developer feedback, including successes, friction, missing documentation and improvements.

Also complete the actual official Uniswap Developer Feedback Form. A repository file alone does not satisfy this requirement.

---

# 17. ETHGLOBAL SUBMISSION COMPLIANCE

Follow the sponsor checklist and general event rules.

This is an in-person hackathon with a strict submission deadline.

Check the official event deadline and submission requirements before finalizing.

The currently documented deadline is 7 November 2026, 9:00 AM IST.

Important:

- Select no more than three sponsors.
- Select Uniswap Foundation, 0G and Chainlink.
- Use the appropriate Classic or Continuity lane.
- Do not falsely claim new work if work existed before kickoff.
- If using Continuity, document the dated baseline and substantive event changes.
- Maintain meaningful incremental Git commits.
- Keep the repository public and open-source.
- Disclose AI-assisted files and assets.
- Include specs, prompts and planning artifacts.
- Demonstrate meaningful human contribution.
- Submit the project title, description and repository.
- Provide actual sponsor evidence.

Video:

- Under three minutes for 0G.
- At least 720p.
- Spoken human narration.
- Do not use AI voiceover.
- Show the real working application.
- Show actual sponsor integrations.
- Do not speed up footage.
- Do not fabricate execution evidence.

Create a sponsor evidence tracker with:

- Sponsor.
- Track.
- Requirement.
- Implementation location.
- Proof.
- Status.
- Missing evidence.
- Final verification.

Only mark a requirement DONE after actual proof exists.

---

# 18. EXECUTION PLAN

Do not spend excessive time planning.

Work in the following order.

## P0 — Repository and environment inspection

First inspect:

- Existing repository.
- Operating system.
- Node.js.
- npm/pnpm.
- Git.
- Foundry.
- Anvil.
- Solidity compiler.
- CRE CLI.
- Installed SDKs.
- Environment variables.
- Available RPC endpoints.
- 0G configuration.
- Existing code and dependencies.

Inspect official documentation for SDK compatibility.

Create:

- PLAN.md
- AGENTS.md
- EVIDENCE.md
- .env.example

Do not overwrite working code.

If the repository is empty, scaffold the project cleanly.

If existing files exist, understand them first.

Immediately start P1 after inspection.

## P1 — Application foundation

Deliver:

- Working Next.js application.
- Responsive landing page.
- Scanner interface.
- Backend API.
- SQLite database.
- Address validation.
- Real RPC connection.
- Real bytecode retrieval.

Acceptance:

Application starts successfully and can retrieve actual contract bytecode.

## P2 — Uniswap integration

Deliver:

- Permission decoder.
- Callback mapping.
- Return-delta mapping.
- Pool context where available.
- Block and timestamp retrieval.
- Contract fingerprint.

Acceptance:

Real hook addresses can be inspected and decoded correctly.

## P3 — Risk engine and Evidence Graph

Deliver:

- Deterministic analysis rules.
- Structured findings.
- Evidence nodes.
- Evidence relationships.
- Interactive evidence graph.

Acceptance:

Every displayed finding can be traced to real observations.

## P4 — Hook Behavior Diff

Deliver:

- Historical snapshots.
- Repeated scans.
- Code hash comparison.
- Permission comparison.
- Proxy-aware implementation comparison.
- Finding comparison.
- Changed evidence visualization.

Acceptance:

Two scans of the same hook can be compared reproducibly.

## P5 — Foundry/Anvil simulation

Deliver:

- Controlled Uniswap v4 fixture.
- Baseline swap.
- Hook-enabled swap.
- Captured execution results.
- Balance and return-delta comparisons.

Acceptance:

At least one meaningful scenario passes and its actual logs are available.

## P6 — 0G Private Computer

Deliver:

- Real inference client.
- Evidence-based prompt.
- Structured output.
- Validation.
- Actual request ID persistence.
- UI integration.
- Error handling.

Acceptance:

A judge can trigger inference through the primary scan workflow and inspect the real request evidence.

## P7 — Chainlink CRE and registry

Deliver:

- HookRiskRegistry.sol.
- Foundry tests.
- CRE workflow.
- External API integration.
- Report validation.
- Registry publication path.
- Successful CLI simulation.
- Saved logs.

Acceptance:

CRE successfully orchestrates the workflow and produces verifiable execution evidence.

## P8 — Hook Passport

Deliver:

- Canonical report.
- Report hash.
- Public passport.
- Verification endpoint.
- Registry comparison.
- Current contract fingerprint comparison.
- Shareable URL.

Acceptance:

An external user can verify the historical report and determine whether the current contract matches the analyzed version.

## P9 — Finalization

Deliver:

- All relevant tests passing.
- Production build.
- Public GitHub repository.
- Deployment.
- Working live demo.
- Sponsor evidence.
- Documentation.
- AI disclosure.
- FEEDBACK.md.
- Submitted Uniswap feedback form.
- Demo script.
- Video preparation.

---

# 19. ENGINEERING RULES FOR CODEX

These rules are mandatory.

1. Act as an implementation agent, not just an advisor.
2. Inspect files before modifying them.
3. Make small, reversible changes.
4. Do not rewrite working modules unnecessarily.
5. Use official documentation.
6. Do not invent SDK APIs.
7. Do not invent API endpoints.
8. Do not fabricate blockchain data.
9. Do not fabricate 0G request IDs.
10. Do not fabricate CRE execution logs.
11. Do not fabricate transaction hashes.
12. Do not fabricate contract deployments.
13. Do not claim tests passed unless executed.
14. Do not claim an integration is complete if it is only mocked.
15. Keep mocks isolated to tests.
16. Do not use paid APIs or services without explicit approval.
17. Use environment variables for credentials.
18. Never expose secrets to frontend code.
19. Run relevant tests after every implementation phase.
20. Inspect Git diff before committing.
21. Keep incremental Git commits.
22. Update documentation as implementation evolves.
23. Preserve actual logs and evidence.
24. Explain blockers precisely.
25. Continue independent tasks when one integration is blocked.
26. Never silently downgrade a real integration into a mock.
27. Clearly label unsupported functionality.
28. Prioritize a working end-to-end demo over excessive features.

If 0G or CRE access is blocked, implement the independent modules first, document the exact blocker and continue. Do not mark the sponsor integration complete.

---

# 20. REQUIRED FINAL DEMONSTRATION

The final demo should follow this journey.

1. Open Hookscan.
2. Enter a real Uniswap v4 hook address.
3. Select its actual network.
4. Retrieve real contract bytecode.
5. Decode Uniswap permissions.
6. Inspect the deterministic risk findings.
7. Open the Evidence Graph.
8. Follow a finding to its underlying evidence.
9. Run a controlled simulation.
10. Trigger actual 0G Private Computer inference.
11. Display its real request ID.
12. Save the first Hook Passport.
13. Rescan the hook.
14. Demonstrate Hook Behavior Diff.
15. Show newly observed or unchanged evidence.
16. Publish a report using the CRE workflow.
17. Show the actual registry transaction or successful CRE simulation evidence, as applicable.
18. Open the public verification page.
19. Verify the report hash.
20. Explain whether the current contract still matches the analyzed version.

The demo must show genuine implementation, not prepared screenshots or fabricated responses.

---

# 21. FINAL ACCEPTANCE CRITERIA

Do not declare Hookscan complete until the following are satisfied:

[ ] Real Uniswap v4 hook analysis.

[ ] Correct permission decoding.

[ ] Deterministic evidence-linked risk findings.

[ ] Reproducible contract fingerprint.

[ ] Historical scan storage.

[ ] Hook Behavior Diff works.

[ ] Proxy and implementation changes handled honestly.

[ ] Evidence Graph works interactively.

[ ] Evidence links connect findings to actual observations.

[ ] Meaningful baseline-versus-hook simulation.

[ ] Actual 0G Private Computer inference.

[ ] Actual 0G request IDs visible.

[ ] Chainlink CRE successfully simulates.

[ ] CRE orchestrates blockchain and external analysis.

[ ] HookRiskRegistry contract tested.

[ ] Registry publication path works.

[ ] Hook Passport generated.

[ ] Report hash can be independently verified.

[ ] Current contract matching is distinguishable from historical report authenticity.

[ ] Public GitHub repository.

[ ] README setup instructions tested.

[ ] FEEDBACK.md complete.

[ ] Uniswap Developer Feedback Form submitted.

[ ] Exact Uniswap integration code references documented.

[ ] 0G sponsor requirements satisfied.

[ ] Chainlink CRE sponsor requirements satisfied.

[ ] EVIDENCE.md contains reproducible proof.

[ ] AI disclosure complete.

[ ] Meaningful incremental commits.

[ ] Public demo accessible.

[ ] Demo video meets event and sponsor requirements.

Do not hide incomplete requirements.

---

# 22. START NOW

Your first response must not be a long explanation of the architecture.

Start by:

1. Inspecting the current repository.
2. Inspecting the operating system and installed tools.
3. Checking Node.js, Foundry, Anvil and CRE CLI.
4. Checking the compatibility of the required SDKs.
5. Identifying missing environment variables and credentials without exposing them.
6. Creating the concise execution checklist.
7. Identifying the highest-risk blockers.
8. Beginning P1 immediately.

Work directly in the repository.

After every phase, report:

- What was implemented.
- Files created or modified.
- Commands executed.
- Tests passed.
- Tests failed.
- Actual integration evidence.
- Remaining blockers.
- Next immediate task.

Do not wait for me to approve every small engineering decision.

Ask for approval only when an action involves paid services, irreversible operations, external financial transactions or sensitive credentials.

**Your objective is not to produce the largest codebase. Your objective is to produce the strongest working, verifiable Hookscan submission within the available hackathon time.**

BEGIN WITH P0 INSPECTION AND IMMEDIATELY PROCEED TO P1.