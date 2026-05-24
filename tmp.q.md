# SPI-102 Decisions And Remaining Questions

## Settled Decisions

- `execute` is local, atomic, and await-free.
- Base SPI-102 supports one edge per `quote` and `execute`.
- Multi-edge local routes are a future profile over the same offer graph.
- Quotes are account-bound reusable previews, not one-shot reservations.
- Base SPI-102 does not require quote storage, quote nonces, or graph/state
  version numbers.
- `discover` can return live and locked/future edges.
- `discover` is account-required so statuses such as `insufficientInput` and
  `unauthorized` are concrete for the requested account.
- `quote` may preview locked/future edges, but `execute` must reject until the
  edge is live.
- Locked/future edges use typed statuses such as `live`, `notMature`,
  `insufficientInput`, `paused`, `unauthorized`, and `protocolSpecific`.
- Nodes use structured `NodeId` values, not only `Principal`.
- Edges use structured `EdgeId` values with `protocol`, `namespace`, and `id`.
- External ledger nodes remain supported for ICRC ledger assets. SPI-100 account
  blobs are accounts only, not asset ids.
- Position-like states use a node class plus explicit position ids in quote and
  receipt data.
- Partial position changes are in scope: receipts must identify consumed
  position ids, consumed amounts, remaining positions, and newly created
  positions.
- Position effects are separate from fungible input/output baskets.
- Quote witnesses are hints only. `execute` may use them for lookup, but must
  recheck current canister state before mutating.
- Delayed-transition domains use the implementing canister's protocol time,
  normally IC time.
- Execute guards use generic machine-readable limits such as `maxSpend`,
  `minReceive`, `deadline`, and `maxFee`, with protocol-specific extension
  data allowed.
- State expectations such as proposal id, position id, pool id, config facts,
  or unlock-time expectations belong in guard extension data, not a base
  `requiredState` field.
- Universal base laws are authorization, quote binding, availability safety,
  guard satisfaction, receipt truth, and failure safety.
- Failure safety preserves account-visible state and protocol accounting touched
  by the attempted edge.
- Mandatory offer metadata is minimal: stable ids, node and edge shapes, and
  typed status. Labels, display assets, lock display, and risk text are
  optional.
- Firm quotes and reservations are out of scope for base SPI-102.

## Remaining Questions

1. What exact SR9/Candid record shape should encode `NodeId`, discovery, quotes,
   guards, and receipts?

2. Should future local-route support be one optional profile or several profiles
   for swaps, baskets, and position workflows?
