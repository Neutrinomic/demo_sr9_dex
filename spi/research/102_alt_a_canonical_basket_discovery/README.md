# SPI-102 Alternative A: Canonical Basket And Discovery Kernel

This alternative tests compact DEX and DAO implementations where discovery
returns client-readable nodes and edges, quotes return canonical input/output
baskets, and execute rechecks guards atomically.

## Run

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_a_canonical_basket_discovery/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_a_canonical_basket_discovery/examples/CanonicalBasketDexActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_a_canonical_basket_discovery/proofs/BasketDiscoveryObservers.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify-timeout-ms 120000 --deterministic --verify reference/dex/spi/research/102_alt_a_canonical_basket_discovery/examples/CanonicalBasketDaoActor.sr9
```

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/102_alt_a_canonical_basket_discovery/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/102_alt_a_canonical_basket_discovery/test/config.json bun run shared/harness/runner/runE2E.ts
```
