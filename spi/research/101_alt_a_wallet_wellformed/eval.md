# 101-A Evaluation

Status: pass.

## Command Results

Verification:

```text
Kernel.sr9                       PASS
examples/WalletWellformedActor   PASS
proofs/WalletWellformedObservers PASS
```

Runtime:

```text
E2E_CONFIG=spi/research/101_alt_a_wallet_wellformed/test/config.json bun run shared/harness/runner/runE2E.ts
Suites: 1 ok, 0 fail | Tests: 2 ok, 0 fail, 0 skipped
Report: reports/runs/2026-05-22T00-51-28Z/test-results.md
```

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 4 | Successful wallet responses are account-authorized and account-bound. |
| provability | 4 | Kernel predicates and actor postconditions are deliberately small. |
| client usability | 4 | Response uses canonical SPI-101 wallet entries. |
| implementability | 5 | A normal actor can use the kernel with minimal proof plumbing. |
| kernel usefulness | 4 | Gives actors reusable authorization and binding predicates. |
| simplicity | 5 | This is the smallest useful wallet kernel. |
| cleanliness | 4 | No new DTOs; uses SPI-101/SPI-100 directly. |
| extensibility | 3 | Does not address pagination or duplicate detection. |
| footgun resistance | 3 | Does not prove no duplicate wallet entries. |
| runtime coverage | 4 | Client tests cover authorized mixed wallet and unauthorized rejection. |
| verifier ergonomics | 4 | Expected to verify without trusted helpers. |

## Occam Analysis

The simpler path is to prove only account authorization and receipt binding.
This alternative tries that first. It rejects a full array-scanning
well-formedness law because the later alternatives are better places to test
whether that complexity pays for itself.
