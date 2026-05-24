# 101-C Capability And Pagination Kernel

This alternative tests explicit account visibility and wallet pagination laws.

The example exposes five wallet entries over three pages and proves successful
page responses are authorized, account-bound, filter-accepted, cursor-valid, and
monotonic.

## Commands

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_c_capability_pagination/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_c_capability_pagination/examples/PaginatedWalletActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_c_capability_pagination/proofs/PaginationObservers.sr9
```
