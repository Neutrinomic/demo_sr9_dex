# OP10 Baseline

This baseline captures the canonical SPI kernels after the first research pass
and after OP10 verifier work.

The kernel baseline is green:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/101/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/102/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/103/Kernel.sr9
```

All three commands succeeded.

