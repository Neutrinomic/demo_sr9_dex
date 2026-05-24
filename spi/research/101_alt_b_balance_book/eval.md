# 101-B Evaluation

Status: pass with fixed-shape export laws proved.

## Command Results

Verification:

```text
Kernel.sr9                    PASS
examples/AccountNodeBook      PASS
examples/BalanceBookWallet    PASS
proofs/BalanceBookObservers   PASS
```

Runtime:

```text
E2E_CONFIG=spi/research/101_alt_b_balance_book/test/config.json bun run shared/harness/runner/runE2E.ts
Suites: 1 ok, 0 fail | Tests: 2 ok, 0 fail, 0 skipped
Report: reports/runs/2026-05-22T02-32-04Z/test-results.md
```

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 4 | Account authorization gates setup and wallet read paths. |
| provability | 4 | Book ordering plus fixed wallet export no-zero/no-duplicate scalar laws verify. |
| client usability | 4 | Clients see normal SPI-101 wallet entries. |
| implementability | 4 | Book API is small and reusable. |
| kernel usefulness | 4 | Book plus wallet binding reduce repeated actor logic. |
| simplicity | 4 | One map key model is simpler than separate maps per asset family. |
| cleanliness | 4 | Canonical node key avoids account/node confusion. |
| extensibility | 4 | The book can hold ledger and local nodes. |
| footgun resistance | 4 | The example proves no zero fungible exports and no duplicate ledger/local export nodes. |
| runtime coverage | 4 | Tests cover ledger/local export and unauthorized setup/read. |
| verifier ergonomics | 4 | BMap proofs work; export laws verify when stated over scalar snapshots instead of mutable entry records. |

## Occam Analysis

The simpler path is 101-A's static entry validation. This alternative adds a
book only because real protocols need reusable credit/debit state. The canonical
node-key wrapper is accepted complexity because raw blobs can collide between
ledger-derived and local payload-derived keys.
