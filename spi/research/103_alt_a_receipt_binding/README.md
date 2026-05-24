# SPI-103 Alternative A: Receipt Binding Bridge Kernel

This alternative tests whether the current SPI-103 bridge shape becomes strong
enough when the kernel makes receipt binding, ledger-node identity, and fee
debit laws explicit.

## Run

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_a_receipt_binding/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_a_receipt_binding/examples/AccountLedgerBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_a_receipt_binding/examples/ReceiptBindingBridgeActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_a_receipt_binding/proofs/ReceiptBindingObservers.sr9
```

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/103_alt_a_receipt_binding/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/103_alt_a_receipt_binding/test/config.json bun run shared/harness/runner/runE2E.ts
```

