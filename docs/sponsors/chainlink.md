# Chainlink — Best workflow with CRE

cre/main.ts uses the official SDK: CronCapability, HTTPClient with identical consensus, EVMClient.headerByNumber, runtime.report and EVMClient.writeReport. It retrieves a passport, recomputes its hash, validates evidence references and a genuine 0G request (required by default), compares the EVM block hash and prepares a registry report. Publication is disabled by default and requires a deployed registry configured for a trusted CRE forwarder and workflow identity.

HookRiskRegistry.sol enforces authorization, validates input, prevents duplicate report hashes, preserves historical reports and updates each hook's latest version. Ten registry tests and the local publication/readback integration passed.

CRE CLI v1.39.0 was downloaded from the official GitHub release and its SHA-256 checked. The TypeScript workflow is checked against installed SDK 1.23.0 declarations. evidence/cre-attempt.txt records the real CLI response: authentication is required. The user explicitly chose to continue with CRE marked blocked. A compile does not satisfy successful simulation or deployment; check EVIDENCE.md for the actual compile result.

Successful CLI simulation and full workflow evidence remain **BLOCKED** until authentication and actual input configuration are available. No CRE execution identifier or transaction was invented.

References: https://docs.chain.link/cre, https://docs.chain.link/cre-templates, https://github.com/smartcontractkit/cre-templates, https://ethglobal.com/events/mumbai/prizes/chainlink.
