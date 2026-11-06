# CRE orchestration

Based on official smartcontractkit/cre-templates, using the installed SDK declarations (1.23.0).
The workflow fetches a saved passport API, recomputes its canonical hash, checks evidence references and an actual 0G request, reads its EVM block through CRE, prepares a signed report, and optionally calls the supported writeReport path.

Set a REAL Sepolia passport URL in config.staging.json. Log in with `cre login`. From this directory:

```sh
cre workflow simulate . --target staging-settings --trigger-index 0 --non-interactive
```

Bun >=1.2.21 is required for TypeScript/WASM compilation. The root lockfile pins the SDK.
Never use `--broadcast` without separate authorization for the transaction and gas. `publish: false` prepares a report without submitting it.
For an independent orchestration test when 0G access is blocked, set requireInference=false explicitly; that does not complete the 0G sponsor integration.

Deploy HookRiskRegistry and configure its trusted forwarder AND workflow ID before setting publish=true.
Do not treat a simulation's synthesized transaction output as a real deployed-chain transaction.
Store unedited successful CLI output under evidence/. A login failure is not successful simulation evidence.
