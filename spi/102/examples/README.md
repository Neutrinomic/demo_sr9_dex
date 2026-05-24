# SPI-102 Examples

These actors exercise the current 100/101/102/103 split:

- SPI-100 `AccountCodec.Account` identifies user accounts.
- SPI-101 `spi_101_wallet` reports ledger and local protocol holdings.
- SPI-102 `spi_102_discover`, `spi_102_quote`, and `spi_102_execute` describe
  and execute local atomic transitions.
- SPI-103 `spi_103_icrc_deposit` and `spi_103_icrc_withdraw` handle ICRC
  ledger ingress/egress for the local wallet balances.

`DexPrincipalLpActor.sr9` models account-indexed token A, token B, and LP share
balances. Token A and B are SPI-101 ledger nodes, LP shares are a SPI-101 local
node, and reserves plus total LP supply remain protocol state. Quotes recompute
swap/add/remove outputs from current reserves. Execute recomputes a receipt and
uses the SPI-102 kernel to prove successful receipts are quote-bound,
caller-authorized, live, and accepted by the caller's guard.

`DaoPendingActor.sr9` models liquid governance tokens, active stake, pending
unstake, cancel-unstake, and claim-unstaked. Liquid tokens are a ledger node;
active and pending stake are local nodes. Pending unstake is exposed both as a
SPI-102 intermediate transition node and as a SPI-101 wallet holding with a
locked status until maturity.

Verification:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/102/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --cores 1 --verify-timeout-ms 120000 --verify reference/dex/spi/102/examples/DexPrincipalLpActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --cores 1 --verify-timeout-ms 120000 --verify reference/dex/spi/102/examples/DaoPendingActor.sr9
```
