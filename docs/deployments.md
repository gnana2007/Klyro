# Deployment records

Only actual deployments and transactions are listed in evidence/local-simulation.json and evidence/integration.json. They are chain 31337 local Anvil records, not public testnet/mainnet deployments. evidence/proxy-upgrade.json records a separate local proxy-resolution test.

No public registry deployment, external publication transaction or authenticated CRE deployment is claimed. Current hosted demo status is recorded in README and EVIDENCE.md. Local addresses and transactions must never be represented as explorer-verifiable public-chain evidence.

Deploy the supplied Node 24 container to a host with persistent disk. Set APP_ORIGIN to its HTTPS URL and DATABASE_PATH to its mounted SQLite path. Keep 0G credentials and OPERATOR_TOKEN in the host's secret environment. A free SQLite disk is required; do not place this app on an ephemeral filesystem.

For a testnet registry, deploy HookRiskRegistry with the real owner. Authorize the documented CRE forwarder AND workflow ID. Record addresses and receipts, configure REGISTRY_ADDRESS/REGISTRY_CHAIN_ID, and only then enable CRE publication. No external transaction is automatically broadcast by repository setup or CI.
