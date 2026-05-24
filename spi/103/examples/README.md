# SPI-103 Examples

`SPI103IcrcWalletDemo.sr9` is a compact combined SPI-101/SPI-103 actor for
verification and client-shape testing.

It intentionally simulates successful ICRC ledger movement instead of calling a
real ledger. The important SPI lesson is that ICRC bridge calls are not useful
without the SPI-101 wallet query:

- `spi_103_icrc_deposit` credits the SPI-101 `#ledger(ledger)` wallet node;
- `spi_103_icrc_withdraw` debits that node by `amount + fee`;
- `spi_101_wallet` is how clients observe the local result.

Production actors should replace the simulated receipt with real
`icrc2_transfer_from`, `icrc1_fee`, and `icrc1_transfer` calls while preserving
the same pre/post local accounting guarantees.
