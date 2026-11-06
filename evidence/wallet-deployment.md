# Wallet deployment + publication — local Anvil (31337)

Executed 2026-11-06T15:43:38Z against a real local chain. See evidence/wallet-deployment.json.

Confirmed by reading the chain, not by trusting the request:
- deployment status: DEPLOYED at 0x84ea74d481ee0a5332c457a4d796187f6ba67feb, block 33, gas 532850, codeSize 2001, owner() read-back matches
- record survived an application restart (1 deployment, 1 publication still present)
- publication status: PUBLISHED, block 34, gas 161712
- duplicate publication of the same report hash reverted on chain
- registry state read live: owner 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, codeSize 2001, block 34
- /api/verify/<passport> => integrity MATCH, authenticity REGISTRY_MATCH, publishedAt 1793979772
