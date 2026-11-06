# Hook Behavior Diff

Compare snapshots of the same chain and address in chronological block order. Runtime hash/size, permissions, owner getter, implementation address/hash, proxy admin/beacon, dependencies and state fingerprints are compared with canonical serialization. Findings use stable rule IDs and are classified new, unchanged, changed, worsened, resolved or requiring reassessment. Missing source, unknown findings and changed engine versions prevent unsupported resolution claims.

An unresolved implementation is always inconclusive, including when both unresolved hashes are null. A new block changes the observation identity, not the monitored state fingerprint. Address-derived permission bits remain fixed for one address. Changed code is not proof of changed semantics or malice.

Tests include a real Anvil EIP-1967 upgrade. evidence/proxy-upgrade.json records the same proxy runtime hash, changed implementation hashes and actual upgrade transaction. The fixture is explicitly not claimed to be a pool-compatible hook.
