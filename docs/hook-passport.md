# Versioned passport and canonical serialization

Schemas: hscan.state.v1, hscan.observation.v1, hscan.snapshot.v1, hscan.diff.v1, hscan.passport.v1.

Canonical serialization sorts object keys by JavaScript string order, retains array order and encodes strings/booleans/null/finite numbers as JSON. Undefined, bigint and non-finite numbers are rejected; large blockchain integers are decimal strings. Hashes are Ethereum keccak256 over UTF-8 canonical JSON. This explicitly documented schema is not claimed to be RFC 8785 for every possible Unicode input.

State identity includes chain ID, lowercased hook address, runtime hash, proxy resolution (including explicit unresolved state), permission bitmap, analysis version and selected configuration. Observation identity includes the state identity, block number and block hash. This avoids reporting a new block as a contract change while preserving a block-specific fingerprint.

The immutable report hash covers report creation time/ID, the full snapshot and its observation times/evidence, diff, inference input/output hashes, actual request reference, verification metadata and limitations. It excludes UI state, registry publication and later CRE execution records. The original JSON is stored once; a later explanation needs a new passport.

The public page recomputes the report hash in the browser. The server checks it against the stored reference and, when configured, the registry's chain/hook/state/report fields. A supplied report file can be hashed locally or submitted for comparison. Integrity-only is explicitly distinguished from registry-backed historical authenticity. The current-chain check is independent and can report MATCH, CHANGED or UNVERIFIABLE without rewriting the historical verdict.

Current-contract verification recomputes the monitored state using the scanned fingerprint version and reports analysis-engine updates separately as a reanalysis recommendation; an engine update alone is not labeled a contract change.
