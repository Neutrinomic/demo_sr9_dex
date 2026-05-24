# Current DAO SPI Surface

This DAO actor is a fresh current-SPI implementation. The previous DAO was moved
to `research/v1` as reference material because it used older SPI names and mixed
DAO-specific proposal machinery with the wallet/transition surface.

The new actor exposes:

- `spi_100_account` for SPI-100 account construction.
- `spi_101_wallet` for account holdings across liquid, active stake, pending
  unstake, and pending withdrawal nodes.
- `spi_102_discover`, `spi_102_quote`, and `spi_102_execute` for the local
  stake graph.
- `spi_103_icrc_deposit` and `spi_103_icrc_withdraw` for ICRC ledger movement.

The stake graph has four local transitions: stake, request unstake, cancel
unstake, and claim unstaked. Pending unstake is represented as an intermediate
node; it can be cancelled back into active stake or claimed into liquid balance
after the unlock time.
