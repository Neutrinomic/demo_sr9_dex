# SPI-102 Alternative A Spec

The public surface is the canonical SPI-102 trio:

- `spi_102_discover`
- `spi_102_quote`
- `spi_102_execute`

Semantic laws:

- Discovery must bind to the requested account.
- Discovery must include node descriptions for every edge input/output.
- Quote must bind to the requested account and selected edge.
- Quote intent amount must be nonzero.
- Execute must bind the receipt to the quote.
- Execute must reject stale quotes and guard failures.
- Guards use canonical baskets for `minReceive`, `maxSpend`, and `maxFee`.

Tradeoff: basket containment is still a trusted iterator helper because current
array/loop proof support is not strong enough to prove generic multiset
containment cleanly.

