# Deployment records

Only actual deployments and transactions belong here, and they are recorded from
receipts.

## Registry contract

`HookRiskRegistry` is the only contract Klyro needs on a chain. It records who
published which report for which hook version. It never certifies that a hook is
safe.

| Where | Address | Status |
| --- | --- | --- |
| Local Anvil (31337) | see `evidence/registry-deployment.json` | deployed, receipt recorded |
| Public testnet | — | **not deployed.** Needs a funded deployer or wallet approval |

`LocalScenario` and `ProxyFixture` are test fixtures for behavioural simulation
and proxy resolution. They are not part of the product and must not be deployed
to a shared network.

## How to deploy

Preferred: open `/?view=deploy` and use **Deploy with wallet**. Your wallet signs
one deployment transaction; the app reads the receipt and records the address.
The server never sees a key.

Automatable: `npm run deploy:registry -- --chain 11155111`. This reads
`DEPLOYER_PRIVATE_KEY` from the environment (never printed) and refuses mainnet
without an explicit flag. For local Anvil: `--chain 31337`.

## After a deployment

1. Set `REGISTRY_ADDRESS` and `REGISTRY_CHAIN_ID` and restart the server.
2. Confirm `GET /api/registry/state` reads the owner you expect from the chain.
3. Authorize the CRE forwarder (`setForwarder`) and workflow id (`setWorkflow`)
   as the owner before enabling CRE publication.
4. Publish a passport from `/?view=deploy`; a record appears only after the
   receipt and the on-chain read-back both match.

## What has never been claimed

No public-chain registry deployment, no public publication transaction and no
authenticated CRE simulation are claimed. `evidence/wallet-deployment.json` and
`evidence/registry-deployment.json` are local chain 31337 records and must not be
presented as explorer-verifiable public evidence.
