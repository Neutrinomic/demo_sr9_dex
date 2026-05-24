# SPI-103 Alternative A Spec

The public interface is the canonical SPI-103 ICRC bridge:

- `spi_103_icrc_deposit(request)`
- `spi_103_icrc_withdraw(request)`
- `spi_101_wallet(request)` for the wallet-visible result of bridge accounting

Semantic laws:

- A successful deposit receipt must bind `account`, `ledger`, `from`, and
  `amount` to the request.
- A successful deposit may credit only the SPI-101 `#ledger(request.ledger)`
  node.
- A successful withdrawal receipt must bind `account`, `ledger`, `to`, and
  `amount` to the request.
- A successful withdrawal may debit only the SPI-101 `#ledger(request.ledger)`
  node.
- A successful withdrawal receipt must expose the exact fee and
  `debitAmount = amount + fee`.
- Caller authorization is account-based through SPI-100 account ownership; the
  SPI-100 account blob is not treated as an authenticated principal.

Tradeoff: this alternative does not model real awaited ledger calls. It proves
the local bridge receipt contract and wallet-visible accounting only.

