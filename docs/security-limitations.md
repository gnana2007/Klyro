# Security and detection limits

This is bounded evidence-driven investigation. It is not an audit, formal verification, semantic-equivalence proof, or safety certification.

- Permission bits are capabilities encoded in the low fourteen address bits. They do not establish implementation validity or maliciousness.
- Pool lookup is limited to 2,000 recent blocks by default and at most 10,000 explicitly requested blocks. No hit means UNKNOWN, not no pool exists.
- EIP-1967, beacon and exact EIP-1167 clones are recognized. Unknown indirection remains UNKNOWN. Successful empty slots do not prove the absence of all upgrade patterns.
- PUSH-aware opcode scanning is incomplete static inspection. Candidate address constants are not proven dependencies; bytecode metadata can still introduce false candidates. Function-name source matching may locate an interface rather than an executable body.
- Sourcify source is accepted only when its reported on-chain runtime hash equals the observed target hash. Local compiler reproduction is not performed. Proxy source targets the resolved implementation when available.
- Current fingerprint matching covers code, recognized proxy information, flags, owner getter and analysis version. It does not compare every storage slot, external dependency's state, oracle, fee control or pool configuration.
- Source absence is uncertainty, not proof of maliciousness. A verified contract is not automatically safe. Findings are indicators or capabilities; none is advertised as a confirmed vulnerability.
- Local simulation uses our explicit fixture, not arbitrary mainnet hook execution. Its fee is intentional behavior, not a vulnerability claim.
- Router-reported TEE verification is not independent cryptographic verification. The application displays NOT_PERFORMED for independent verification. Requested private routing alone is not proof that a response was private.
- Production inference and administrative endpoints require OPERATOR_TOKEN. Public scanning/passport operations have a global process-local quota. Multi-process deployments need shared quotas and authentication. The server accepts only fixed 0G URLs and configured RPCs; user-provided RPC URLs are not accepted.
- Jobs launched with setImmediate need a continuously running Node process. A process restart can interrupt an in-flight job; there is no durable queue recovery yet.
