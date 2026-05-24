# 103-B Evaluation

Status: pass with trusted reject/delta adapters and a sound post-await proof
model.

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 4 | Runtime tests confirm failed deposit creates no credit and failed withdraw restores the reserved debit. |
| provability | 4 | Kernel, observers, mock ledger, account book, and bridge actor verify; reject simulation and BMap deltas use narrow trusted adapters. |
| client usability | 4 | Uses canonical SPI-103 methods and client-visible ledger failure variants. |
| implementability | 3 | Real await logic is more complex than 103-A. |
| kernel usefulness | 4 | Start/success/failure predicates map to bridge phases. |
| simplicity | 3 | Pending state is necessary but adds complexity. |
| cleanliness | 4 | Mock ledger, bridge, and kernel are separated. |
| extensibility | 4 | Directly supports future real ledger integrations. |
| footgun resistance | 4 | Explicit pending state prevents overlapping withdrawal spend. |
| runtime coverage | 5 | Harness covers success, transfer_from error/reject, fee reject, transfer error/reject, zero amount, and insufficient balance. |
| verifier ergonomics | 3 | Async actor interleavings forced a more precise post-await proof model; intentional reject simulation and BMap delta adapters are still trusted. |

## Occam Analysis

The simpler local-only bridge from 103-A cannot prove ledger failure behavior.
This alternative accepts one pending-withdrawal slot because it is the minimum
state needed to restore debits safely across an awaited transfer.

## Command Results

Verification passed:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/examples/AccountLedgerBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/examples/MockIcrcLedger.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify-timeout-ms 120000 --verify reference/dex/spi/research/103_alt_b_inflight_restore/examples/InFlightRestoreBridgeActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/proofs/RestoreObservers.sr9
```

All verification commands succeeded. The actor proof intentionally avoids the
unsound claim that a pre-await balance remains unchanged after an awaited ledger
call; it proves post-await local credit/restore effects instead.

Runtime passed:

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/103_alt_b_inflight_restore/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/103_alt_b_inflight_restore/test/config.json bun run shared/harness/runner/runE2E.ts
```

Result: `Suites: 1 ok, 0 fail | Tests: 4 ok, 0 fail, 0 skipped`.
Report: `reports/runs/2026-05-22T02-20-55Z/test-results.md`.

## Recommendation

Keep the pending-state design idea. Promote only the sound post-await proof
shape: record pre-await facts for request validation, but prove balance changes
from the state observed after each awaited ledger call.
