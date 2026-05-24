# SPI-102 Prototype Experience

This records what we learned from the removed `alt_*` kernel experiments, the
first deleted example actors, and the current small kernel/example pass.

## Spec Lessons

- `discover` must return a graph, not only a list of edges. Clients need
  `NodeShape` data for every referenced node so ids can be displayed and
  understood. For example, "the account's BTC balance" needs a node with
  account ownership and BTC display metadata, not just an edge that mentions an
  opaque id.
- `DiscoverRequest` should not contain `amount`. Amount belongs in
  `QuoteRequest.intent`; discovery is about the available transition graph, not
  pricing a particular transition.
- Public requests should not contain caller-provided `now`. The canister should
  read local time and pass it to local helpers when classifying maturity,
  expiry, and liveness.
- `#virtual` and principal-shaped node variants were misleading. SPI-100 now
  names account blobs only. Protocol state, LP shares, and position classes use
  SPI-101 `#local` node payloads instead.
- Pending operations should be modeled as intermediate nodes. Unstake is
  `active stake -> pending unstake -> liquid`, with an optional
  `pending unstake -> active stake` cancel edge.
- Quote is still the right place for amount-specific preview, slippage
  protection inputs, and reusable binding data.
- Execute should stay local, atomic, and await-free. External ledger movement
  belongs in SPI-101 or separate settlement flows.

## Kernel Shape Lessons

- Static dispatch was the most reliable SR9 shape. Protocol code selected by
  `EdgeId` can call a shared kernel check for authorization, quote freshness,
  edge liveness, quote/receipt binding, and guard acceptance.
- A scalar module adapter verified. This suggests the desired adapter shape is
  conceptually sound when the state is simple and non-opaque.
- A dynamic module adapter over opaque protocol state was blocked. Passing an
  opaque handle through a module-typed unknown callee failed with the opaque
  handle policy. OP10 callable/module summaries probably need to make checked
  module calls authority-bearing.
- A scalar callback adapter verified. Callback customization can work when
  functions are contract-typed and state is scalar.
- Opaque callbacks only worked when the callback stayed private and statically
  visible. Public higher-order signatures over foreign opaque handles remained
  outside the supported surface.
- Imported public nested modules were not usable as stable module values in the
  module-kernel call shape. Passing `Imported.Adapter` failed with an
  `identifier ... not defined` style diagnostic, so same-file wrappers were
  required.

## SR9 Limitation Notes

- Nested array scans over immutable record arrays failed in the guard/basket
  containment shape. The natural implementation loops over required entries and
  calls a helper that scans available entries. Verification lost array element
  permissions at the loop invariant. The temporary workaround was to trust
  `basketAmount`, `basketContains`, and `guardAccepts`.
- Re-exporting imported trace records that contained nested arrays of SPI-102
  DTOs could emit Viper fields whose anonymous record carrier types were not
  declared. The workaround was to avoid high-level imported trace DTOs.
- `Time.now()` is `Int` in core. If local helpers use time, their `now` fields
  should generally be `Int`, or the actor must explicitly convert and justify a
  non-negative `Nat` timestamp.
- Public actor discovery methods that build a full `Discovery` graph with
  arrays of nodes and edges caused repeated solver/backend cancellation in the
  DEX and DAO examples. The current workaround is to keep
  `spi_102_discover` typechecked but trusted, while quote and execute still
  verify through the kernel.
- Local function literals inside actor discovery hit an uncontracted callback
  purity/trust diagnostic. Plain helper functions with explicit contracts were
  accepted.
- `label` is reserved enough to be a poor parameter/field local name. Use
  `name`, `displayLabel`, or another non-reserved spelling in examples.
- Avoid local or parameter names that collide with helper names such as `edge`
  and `edgeShape`; they produced confusing Viper consistency diagnostics in
  earlier drafts.
- Actor helper functions that read constructor parameters still need explicit
  `reads` clauses. In the examples this affected helpers using token,
  governance, LP-share, unlock, and delay parameters.
- Conditional arrays of position-effect records sometimes need an explicit
  result type annotation to avoid structural coercion involving mutable heap
  identity.
- The accepted modifier order for trusted pure helpers is
  `private pure trusted func`, not `private trusted pure func`.

## Current Example Lessons

- `Types.sr9` is now only DTO/schema surface. Id comparison, authorization,
  quote freshness, guard acceptance, and empty helper construction belong in
  `Kernel.sr9`.
- `Kernel.sr9` verifies as a small static-dispatch kernel. It checks account
  authorization, positive quote flow, quote freshness, edge liveness,
  quote/receipt binding, receipt execution time, and guard acceptance before an
  actor commits local state.
- `Kernel.checkExecute` now has an exact postcondition against
  `executable(...)`: `null` means the executable predicate holds, and any error
  means it does not. `Kernel.quoteResult` similarly proves accepted quotes bind
  to the request, have positive flow, and are live at quote time.
- `Kernel.quoteReturned` is the public quote-result predicate. The examples now
  prove every successful `spi_102_quote` response is caller-authorized,
  request-bound, positive-flow, and selected from a known protocol edge.
- `Kernel.receiptAccepted` is the public execute-result predicate. The example
  `spi_102_execute` methods now prove that every `#ok` receipt is account/edge
  bound to the quote and satisfies the caller guard at `receipt.executedAt`.
  That includes minimum receive, maximum spend, maximum fee, and deadline.
- Kernel projection lemmas are useful. The examples now use receipt-acceptance
  lemmas to expose concrete execute postconditions for deadline, min receive,
  max spend, and max fee without restating the full kernel predicate in each
  actor.
- `DexPrincipalLpActor.sr9` verifies with `spi_102_discover` trusted and
  `--cores 1`. It modeled account-indexed token A, token B, and LP share
  balances with maps, plus reserves and total LP supply in protocol state. LP
  shares now appear as a SPI-101 `#local` node while token A and token B remain
  SPI-101 ledger nodes.
- `DaoPendingActor.sr9` verifies with `spi_102_discover` trusted. It now uses
  account-indexed BMaps for liquid stake, active stake, pending unstake, and
  unlock times. The asynchronous-looking unstake lifecycle remains local graph
  state: liquid governance balance, active stake position, and pending unstake
  position. `cancelUnstake` is just another edge from pending back to active.
- The examples reinforce that `discover` should stay amount-free. Amount enters
  through `QuoteRequest.intent`, and execute rechecks liveness locally with the
  quote amount.
- The examples also reinforce that quote is a preview, not a reservation.
  Execute builds a receipt preview, calls the kernel, then commits only if the
  local state and guard still pass.
- The DEX example recomputes a receipt from current reserves at execute time
  instead of copying quote outputs. This makes slippage protection a guard
  responsibility, which is closer to real DEX behavior.
- BMap invariants are useful but increase solver pressure. The DEX example
  needed `--cores 1`, trusted pure map-update wrappers, and a trusted
  pro-rata LP withdrawal helper because the verifier would not discharge the
  nonzero divisor path for `totalLp`.

## Client Runtime Lessons

- The TypeScript client tests can now deploy the DEX and DAO examples, discover
  graph nodes/edges, quote selected edges, execute quotes, and observe concrete
  wallet/state changes. Funding now belongs to bridge profiles such as SPI-103
  (`spi_103_icrc_deposit`, `spi_103_icrc_withdraw`), wallet reads go through
  SPI-101 (`spi_101_wallet`), and SPI-102 is only discover/quote/execute. This
  is useful coverage beyond verifier proofs
  because it exercises generated Candid, constructor arguments, caller
  identities, and PocketIC time.
- Discovery is usable enough for simple clients: every edge references nodes
  returned in `nodes`, and clients can select edges by stable namespace/id.
- Guard behavior is visible from the client side. A replayed DEX quote with old
  `minReceive` rejects after reserves move, and an expired quote rejects
  without mutating balances.
- Pending DAO operations work as client-visible intermediate nodes. A client can
  see `claim-unstaked` as `notMature`, still obtain a quote, and then observe
  execute reject until local time has advanced.
- What still feels thin for clients: discovery does not describe amount domains,
  intent semantics, default guard construction, or why a protocol-specific
  filter should be used. A generic client can draw the graph and call quote, but
  it still needs protocol knowledge to choose good amounts and guards.
- Error variants are machine-readable, but several are too coarse for wallet UX.
  For example, `#guardRejected` does not say whether min receive, max spend,
  max fee, or deadline failed.
- Discovery shape is not yet stress-tested for pagination, large graphs, or id
  stability across upgrades. Current tests cover small fixed graphs only.
- The current client tests hand-build DTO objects. A small generated or shared
  TS helper layer for `DiscoverRequest`, `QuoteRequest`, `Guard`, node keys,
  and edge lookup would make app integration less error-prone.

## Rebuild Guidance

- Keep the first kernel static-dispatch until the discovery graph and quote
  binding are stable enough to justify callback/module adapters.
- Add module/callback adapters only after OP10 callable summaries can express
  the authority needed for opaque protocol state.
- Use the current examples as executable probes. They implement
  `spi_102_discover`, `spi_102_quote`, and `spi_102_execute` directly and use
  the kernel rather than bypassing it.
