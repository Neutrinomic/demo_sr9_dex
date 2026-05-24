# Baseline SPI Research Snapshot

This folder records the canonical SPI-101, SPI-102, and SPI-103 state before
alternative kernels are tested.

The baseline is intentionally not an alternative. It is the comparison point for
the strict research gates in `../../research.todo.md`.

## Canonical Modules Checked

- `spi/101/Wallet.sr9`
- `spi/102/Types.sr9`
- `spi/102/Kernel.sr9`
- `spi/103/ICRCBridge.sr9`
- `spi/103/Kernel.sr9`

## Commands

From the repo root:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/101/Wallet.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/102/Types.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/102/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/103/ICRCBridge.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/103/Kernel.sr9
```

From `reference/dex`:

```bash
bun run test:spi103
```
