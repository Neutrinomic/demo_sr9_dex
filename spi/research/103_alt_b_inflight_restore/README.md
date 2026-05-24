# SPI-103 Alternative B: In-Flight Restore Kernel

This alternative tests SPI-103 with actual awaited calls to a mock ICRC ledger.
It focuses on local safety around awaits: failed deposits create no credit and
failed withdrawals restore the full pre-await debit.

## Run

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/examples/AccountLedgerBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/examples/MockIcrcLedger.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/examples/InFlightRestoreBridgeActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_b_inflight_restore/proofs/RestoreObservers.sr9
```

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/103_alt_b_inflight_restore/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/103_alt_b_inflight_restore/test/config.json bun run shared/harness/runner/runE2E.ts
```

