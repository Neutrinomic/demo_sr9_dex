# 101-B Account Balance Book Kernel

This alternative tests a reusable account/node balance book under SPI-101.

It keeps the public wallet query simple, but moves local state into a reusable
`AccountNodeBook` keyed by `SPI100.Account` and canonical `SPI101.NodeId`.

## Commands

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_b_balance_book/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_b_balance_book/examples/AccountNodeBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_b_balance_book/examples/BalanceBookWalletActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_b_balance_book/proofs/BalanceBookObservers.sr9
```
