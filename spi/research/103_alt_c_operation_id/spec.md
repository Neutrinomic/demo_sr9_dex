# SPI-103 Alternative C Spec

Base SPI-103 is unchanged. This folder defines an optional retry profile:

- `spi_103_icrc_deposit_with_id(request)`
- `spi_103_icrc_withdraw_with_id(request)`
- `spi_103_operation_status(operationId)`

Extension request fields:

- `operationId : Nat`
- `request : SPI103.IcrcDepositRequest` or `SPI103.IcrcWithdrawRequest`
- `memo : ?Blob`
- `createdAtTime : ?Nat64`

Semantic laws:

- `operationId` must be nonzero.
- First successful deposit stores `#depositOk(receipt)` and credits once.
- Duplicate successful deposit returns the stored receipt and does not credit
  again.
- First successful withdrawal stores `#withdrawOk(receipt)` and debits once.
- Duplicate successful withdrawal returns the stored receipt and does not debit
  again.
- Unknown ledger outcomes are represented as `#reconciliationNeeded` and are
  visible through `spi_103_operation_status`.

Tradeoff: this profile prevents client retry footguns, but it adds state and
cleanup requirements. It should remain an extension unless most protocols need
idempotent operation ids by default.

