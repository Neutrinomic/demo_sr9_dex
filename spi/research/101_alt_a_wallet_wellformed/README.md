# 101-A Wallet Well-Formed Kernel

This alternative tests the simplest SPI-101 kernel: prove the wallet response is
authorized and account-bound, and provide reusable entry-shape predicates for
actors and proof observers.

The design intentionally avoids a balance book. That belongs to 101-B.

## Commands

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_a_wallet_wellformed/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_a_wallet_wellformed/examples/WalletWellformedActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_a_wallet_wellformed/proofs/WalletWellformedObservers.sr9
```

From `reference/dex`:

```bash
E2E_CONFIG=spi/research/101_alt_a_wallet_wellformed/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/101_alt_a_wallet_wellformed/test/config.json bun run shared/harness/runner/runE2E.ts
```
