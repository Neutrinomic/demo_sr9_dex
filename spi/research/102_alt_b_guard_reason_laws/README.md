# SPI-102 Alternative B: Guard Reason And Protocol Law Kernel

This alternative tests whether `execute` should return structured guard
rejection reasons and expose protocol-law hooks for state transitions.

## Run

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/Types.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/examples/GuardReasonDexActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/proofs/GuardReasonObservers.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify-timeout-ms 120000 --deterministic --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/examples/GuardReasonDaoActor.sr9
```

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/102_alt_b_guard_reason_laws/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/102_alt_b_guard_reason_laws/test/config.json bun run shared/harness/runner/runE2E.ts
```
