# SPI-103 Alternative C: Operation Id And Retry Extension

This alternative tests an explicit SPI-103 extension profile for idempotent
client retries. Base SPI-103 requests stay unchanged; extension methods wrap the
canonical request with an operation id, optional memo, and optional timestamp.

## Run

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/Types.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/examples/OperationBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/examples/AccountLedgerBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/examples/OperationIdBridgeActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/proofs/OperationIdObservers.sr9
```

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/103_alt_c_operation_id/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/103_alt_c_operation_id/test/config.json bun run shared/harness/runner/runE2E.ts
```

