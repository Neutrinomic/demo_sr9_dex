# 103-A Evaluation

Status: pass for the local/simulated bridge gate.

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 4 | Authorization, supported ledger, source-owner, zero amount, and fee headroom are checked before mutation. |
| provability | 4 | Receipt binding and fee laws are kernel-level postconditions. |
| client usability | 4 | Uses the canonical SPI-103 shape and exposes SPI-101 wallet state. |
| implementability | 4 | Simulated local accounting is straightforward. |
| kernel usefulness | 4 | Predicates project request binding, node identity, and fee debit. |
| simplicity | 5 | Minimal extension of the existing canonical bridge kernel. |
| cleanliness | 4 | Bridge law is separate from the account book. |
| extensibility | 3 | Does not cover awaited ledgers or operation ids. |
| footgun resistance | 4 | Prevents unsupported ledger and source-owner mismatch from mutating state. |
| runtime coverage | 4 | Harness covers deposit, withdraw, unsupported ledger, unauthorized caller, source mismatch, zero amount, minimum deposit, and fee headroom. |
| verifier ergonomics | 4 | Modules verify cleanly; proof observers need lemma declarations rather than pure functions for imported projections. |

## Occam Analysis

The simplest bridge guarantee is receipt/request binding. This alternative adds
only two more laws: wallet node identity and exact fee debit. Real async ledger
behavior is excluded so the first gate can decide whether the base seed is
already strong locally.

## Command Results

Verification:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_a_receipt_binding/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_a_receipt_binding/examples/AccountLedgerBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_a_receipt_binding/examples/ReceiptBindingBridgeActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_a_receipt_binding/proofs/ReceiptBindingObservers.sr9
```

All four verification commands succeeded.

Runtime:

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/103_alt_a_receipt_binding/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/103_alt_a_receipt_binding/test/config.json bun run shared/harness/runner/runE2E.ts
```

Result: `Suites: 1 ok, 0 fail | Tests: 3 ok, 0 fail, 0 skipped`.
Report: `reports/runs/2026-05-22T01-08-52Z/test-results.md`.

## Recommendation

Promote the kernel projection pattern, but do not treat this as enough for the
canonical bridge. Awaited ledger behavior still needs the 103-B restore model.
