# SPI-103

SPI-103 contains bridge profiles for moving external assets into and out of the
local wallet state exposed by SPI-101.

Current module:

- `ICRCBridge.sr9`: ICRC deposit/withdraw request, receipt, error, helper, and
  actor types using `spi_103_icrc_deposit` and `spi_103_icrc_withdraw`.
- `Kernel.sr9`: reusable predicates and lemmas for account authorization,
  supported-ledger checks, receipt/request binding, and withdrawal fee debit
  guarantees.
- `examples/SPI103IcrcWalletDemo.sr9`: a small combined SPI-101/SPI-103 actor
  used to verify and runtime-test the wallet/bridge relationship.

SPI-103 should usually be implemented together with SPI-101. The bridge mutates
ledger-backed wallet holdings; SPI-101 is how clients observe those holdings.
