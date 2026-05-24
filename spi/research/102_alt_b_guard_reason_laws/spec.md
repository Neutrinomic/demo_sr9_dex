# SPI-102 Alternative B Spec

This profile keeps `discover`, `quote`, and `execute`, but changes execute
guard failures from an opaque `#guardRejected` into a reason:

- `#deadline`
- `#minReceive`
- `#maxSpend`
- `#maxFee`
- `#protocolSpecific(Text)`

Semantic laws:

- Execute must reject stale quotes before guard checks.
- Execute must bind receipts to quotes.
- Execute must return the first generic guard reason that fails.
- Protocol-specific state laws are expressed as kernel hooks.
- DAO pending transitions must conserve total wallet-visible stake amount across
  liquid, active stake, and pending unstake nodes.

Tradeoff: reason variants improve client UX, but they add an ordering to guard
evaluation. That ordering becomes part of what clients can observe.

