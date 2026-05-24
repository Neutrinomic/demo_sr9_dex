# SPI Seed Research

This report evaluates SPI-100, SPI-101, SPI-102, and SPI-103 as seeds: small reusable
specs and kernels that we grow into concrete protocol examples. The question is
not only whether the examples work. The question is whether the seed makes the
grown product secure, provable, usable by clients, extensible, and worth
regrowing from.

## Evidence

Reviewed:

- SPI specs and importable type/kernel modules.
- SPI-100 account codec/proof/example actor.
- SPI-101 wallet type/spec module.
- SPI-102 kernel, DEX example, DAO pending-unstake example, notes, and client
  tests.
- SPI-103 ICRC bridge type/kernel/example actor and client tests.

Focused verification run:

- `spi/100/AccountCodec.sr9`
- `spi/100/Base58.sr9`
- `spi/100/AccountText.sr9`
- `spi/100/proofs/AccountCodecObservers.sr9`
- SPI-100 codec actor
- `spi/101/Wallet.sr9`
- `spi/102/Kernel.sr9`
- `spi/103/ICRCBridge.sr9`
- `spi/103/Kernel.sr9`
- `spi/103/examples/SPI103IcrcWalletDemo.sr9`

All targeted SR9 verification passed.

Client harness run:

- `bun run test:spi100`: 7 tests passed.
- `bun run test:spi102`: historical 4-test suite from the prior example shape.
- `bun run test:spi103`: 4 tests passed.

Known cleanup left after the SPI-100 redesign:

- Some older SPI-102 and `standard_icrc` examples still import the retired
  SPI-101 deposit/withdraw surface and need to be regrown around SPI-101
  wallet plus SPI-103 bridge methods.
- `bun run typecheck` currently also reports unrelated SPI-102 test type drift
  around guard object inference and an obsolete `positionOutputs` client field.

## Summary

| Seed | Current Strength | Main Value | Main Weakness | Freeze Readiness |
|---|---|---|---|---|
| SPI-100 | Strong | Compact account blobs plus text ids | No registry or authorization policy | Close |
| SPI-101 | Cleaner after split | Standard local wallet view | Wallet well-formedness laws need a kernel | Not yet |
| SPI-102 | Powerful but still maturing | Generic local transition model | Discovery/accounting laws are not proved enough | Not yet |
| SPI-103 | Useful first bridge seed | ICRC ingress/egress over SPI-101 wallet nodes | Example simulates ledger calls; real ledger harness still needed | Not yet |

The layered direction is right:

```text
SPI-100: what wallet/local id does this account blob identify?
SPI-101: what local wallet holdings does this account have?
SPI-102: what local transitions can this account quote and execute?
SPI-103: how do ICRC tokens enter/leave SPI-101 wallet holdings?
```

This composition is improving the dev process. It forced clean boundaries:
SPI-102 no longer owns balances, SPI-101 no longer owns swaps/staking or ICRC
ledger calls, SPI-103 owns the ICRC async boundary, and SPI-100 is the reusable
account-id primitive under them.

The grown product is not equally strong across all three seeds. SPI-100 is
already kernel-like. SPI-101 is now a smaller wallet seed. SPI-102 and SPI-103
both have useful kernels, but the examples exposed where the kernels need
stronger laws and where SR9 needs better proof support.

## Category Scores

Scores are qualitative: strong, medium, weak.

| Category | SPI-100 | SPI-101 | SPI-102 | SPI-103 |
|---|---|---|---|---|
| Security | Strong | Medium | Medium-strong | Medium |
| Provability | Strong | Medium | Medium | Medium |
| Client usability | Medium-strong | Medium | Medium | Medium |
| Guarantees | Strong for account codec | Medium for wallet shape | Medium-strong for execute guard | Medium for receipt binding and fee debit |
| Extensibility | Medium | Strong | Strong | Medium-strong |
| Spec clarity | Strong | Medium-strong | Medium | Medium-strong |
| Runtime test coverage | Medium-strong | Weak | Historical/stale | Medium |

## SPI-100 Assessment

SPI-100 is the strongest seed.

Pros:

- Stateless deterministic account blob encoding.
- No synthetic principals or dependence on reserved-principal semantics.
- Leading zero principal bytes are trimmed, while the original principal length
  is retained so decoding reconstructs the exact wallet principal.
- Text ids use a short `n` prefix, Bitcoin Base58, and CRC32 checksum bytes for
  client-side typo rejection.
- The security rule is crisp: a valid SPI-100 account id is identity data, not
  authorization. Wallet canisters own registration and controller policy.
- Observer proofs cover binary and text encode/decode roundtrips.

Cons:

- Account ids are blobs, so code that previously required `Principal` keys must
  either use blobs directly or keep a separate local principal-shaped asset id.
- `local_id` is only `u32`.
- There is no kind byte or namespace byte. Wallets must manage id ranges or
  meaning out of band.
- Authorization is intentionally out of scope, so implementations need their own
  registry/policy checks.

What to change before freezing:

- Add a short id-allocation convention section: reserve ranges, document kinds,
  and never reinterpret old ids.
- Add negative client tests for max id, overlarge id, non-minimal id bytes,
  non-canonical leading zero suffixes, bad prefixes, bad Base58 characters, and
  checksum failure.
- Consider a tiny metadata convention so clients can ask the wallet what a local
  id means.

Verdict:

SPI-100 is close to freeze-worthy as the root seed. Most changes should be
documentation, tests, and optional extension planning, not a redesign.

## SPI-101 Assessment

SPI-101 became cleaner after moving deposit/withdraw to SPI-103.

Pros:

- Defines one account-authorized wallet query instead of mixing wallet reads
  with ledger movement.
- Uses shared blob `NodeId` wallet entries, so real ledgers, LP shares, stake
  positions, and durable protocol positions can appear in one local wallet view.
- Keeps `account` distinct from `caller` and routes mutation authority through
  the protocol's account registration/controller policy.
- The `#ledger | #local` node split is simple and should carry into SPI-102.
- Moving ICRC-specific fields out of SPI-101 makes room for HMT or other bridge
  profiles without bloating the wallet spec.

Cons:

- `Wallet.sr9` is still mostly DTOs and helper constructors.
- Wallet response laws are still mostly prose: no duplicates, nonzero entries,
  exact account, supported nodes, and position status facts are not kernelized.
- There is no standalone SPI-101 TypeScript client harness because wallet is
  most useful when paired with a mutating profile such as SPI-103 or SPI-102.

What to change before regrowing:

- Create `spi/101/Kernel.sr9` with predicates and helpers for:
  - `accountAuthorized(caller, account)`;
  - wallet receipt well-formedness.
- Add a reusable `AccountBalanceBook` kernel/helper with stronger contracts:
  balance lookup, credit, debit, no duplicate entries, and nonzero export.
- Keep `spi_101_wallet` account-authorized and add kernel predicates proving
  that authorization boundary.
- Test SPI-101 through profiles that mutate wallet holdings, especially SPI-103
  for ledger-backed fungible assets and SPI-102 for local positions.

Verdict:

The SPI-101 idea is better after the split. It is not freeze-ready until wallet
well-formedness and authorization laws move from prose into a kernel.

## SPI-103 Assessment

SPI-103 is the ICRC bridge seed extracted from the old SPI-101 surface.

Pros:

- Gives ICRC deposit/withdraw methods explicit names:
  `spi_103_icrc_deposit` and `spi_103_icrc_withdraw`.
- Keeps ledger-specific types and errors out of SPI-101.
- Defines the wallet effect precisely: deposits and withdrawals affect
  `SPI101.externalLedgerNode(request.ledger)`.
- The kernel mirrors the SPI-102 style: predicates plus lemmas for
  authorization, supported ledger, request/receipt binding, and
  `debitAmount == amount + fee`.
- The combined example proves successful bridge receipts satisfy kernel
  predicates and the client harness observes wallet changes through SPI-101.

Cons:

- The current example simulates ledger success. It tests client shape and local
  accounting, not real `icrc2_transfer_from`, `icrc1_fee`, or `icrc1_transfer`.
- Restore-on-ledger-error and restore-on-reject are specified but not yet
  exercised by the SPI-103 example.
- In-flight withdrawal lock granularity still needs to be made explicit for
  production profiles.
- Bounded-wait/idempotency remains out of scope and needs a future extension.

What to change before regrowing:

- Add a real mock ICRC ledger fixture and tests for successful deposit, failed
  transfer-from, rejected transfer-from, successful withdraw, transfer error
  restore, call reject restore, unsupported ledger, and overlapping withdraw.
- Add operation-id/idempotency extension notes without putting them in the base
  profile.
- Add pre/post-await proof patterns for actors that call real ledgers, including
  trap-avoidance after the ledger response.

Verdict:

SPI-103 is the right place for ICRC ingress/egress. The kernel direction is
good, but the bridge needs real-ledger runtime coverage before it should freeze.

## SPI-102 Assessment

SPI-102 is the most ambitious seed and the one that gained the most from
growing examples.

Pros:

- The `discover -> quote -> execute` model fits both a DEX and a DAO
  pending-unstake lifecycle.
- Intermediate nodes are the right model for delayed transitions. Unstake does
  not need async execution; it becomes request, pending, cancel, and claim
  edges.
- The base rule that SPI-102 execution is local, atomic, and await-free is
  correct. SPI-103 owns ICRC external ledger movement.
- Discovery now returns nodes as well as edges, which is essential for clients.
- Quote is amount-specific and reusable, not a reservation.
- Execute recomputes current state and uses a guard, so stale quotes can reject
  without mutating local wallet holdings.
- `Kernel.receiptAccepted` gives a meaningful public guarantee: successful
  execution is authorized, quote-bound, live at execution time, and accepted by
  the guard.
- Kernel projection lemmas make actor postconditions cleaner.
- Client tests prove that a TypeScript client can discover graph edges, build
  requests, quote, execute, observe SPI-101 wallet state, reject stale slippage, and
  handle DAO maturity.

Cons:

- `spi_102_discover` is trusted in both examples because nested DTO graph
  construction stresses the verifier.
- Basket scans and positive-flow scans are trusted in the kernel.
- Examples still need trusted BMap wrappers and trusted pro-rata LP math.
- `Intent.amount` is too underspecified. Clients do not know whether it means
  exact input, exact output, shares, debt, position amount, or something else.
- `extension : ?Text` is too opaque for serious client interoperability.
- `#guardRejected` is too coarse. Clients cannot tell whether deadline,
  min receive, max spend, or max fee failed.
- Discovery lacks machine-readable amount bounds, intent schemas, default guard
  hints, and position schemas.
- The kernel proves generic acceptance, but not protocol accounting laws such
  as reserve conservation, LP share laws, or DAO supply conservation.
- Failure safety is mostly tested, not proved as a generic postcondition.
- Position handling is still shallow. The DAO example uses a single pending
  slot/id rather than multiple real position ids, split/merge, or pagination.

What to change before regrowing:

- Add intent semantics to discovery. Each edge should say whether quote amount
  is exact input, exact output, exact shares, exact debt, exact position amount,
  or protocol-specific.
- Replace opaque text extensions with a structured extension discipline:
  either standard variants for common cases or an extension schema/witness
  pointer clients can decode safely.
- Split `#guardRejected` into typed reasons:
  `#deadline`, `#minReceive`, `#maxSpend`, `#maxFee`, and
  `#protocolSpecific`.
- Canonicalize baskets. A sorted/deduplicated basket representation, or a
  kernel normalization helper, would make containment and no-duplicate laws
  easier to prove and easier for clients.
- Add discovery well-formedness predicates:
  every edge node is described, edge ids are known, node ids are unique, and
  pagination does not duplicate ids across pages.
- Add protocol-law hooks. The kernel should not define one universal
  conservation equation, but it should provide a standard place for an actor to
  prove `edgeLaw(oldState, newState, quote, receipt)`.
- Add failure-safety predicates for protocol examples: failed execute does not
  debit account-visible balances or touched accounting.
- Strengthen position effects: multiple ids, partial consume, split/merge,
  remaining effects, and explicit unlock/maturity facts should be tested.
- Keep base SPI-102 single-edge. Add route support only as a later profile.

Verdict:

SPI-102 is the right shape, but not ready to freeze. The current kernel is
already valuable for execute guards. The next regrow should focus on client
schemas, guard errors, canonical baskets, discovery laws, and protocol
accounting laws.

## Cross-SPI Findings

The seed/kernel pattern is worth continuing.

Benefits:

- It turns loose prose into importable types and proof predicates.
- It gives examples a reusable proof target instead of bespoke checks.
- It exposes misplaced responsibilities quickly. The `spi_102_balance` mistake
  was exactly this: balances belong to SPI-101, not SPI-102.
- It improves client tests because clients can target standard surfaces instead
  of example-specific helpers.
- It makes verifier limitations visible without distorting the spec.

Current gaps:

- SPI-101 lacks a wallet well-formedness kernel, so the read layer is weaker
  than the layers around it.
- SPI-103 has a first kernel but not a real-ledger harness yet.
- SPI-102 has kernel guarantees for generic guard acceptance but not for
  protocol-specific accounting.
- Client harnesses exist for SPI-100, historical SPI-102, and SPI-103. SPI-101
  is tested through SPI-103 because wallet-only tests have little meaning.
- The examples are useful probes, but they still contain mock ledger behavior
  and simplified position ids.

## Regrow Plan

1. Harden SPI-101 wallet laws.
   Add a wallet kernel and balance-book helper contracts.

2. Harden SPI-103 bridge behavior.
   Add a real mock-ledger harness and pre/post-await restore tests.

3. Strengthen SPI-102 client schemas.
   Add edge intent semantics, guard-failure reasons, amount bounds, default
   guard hints, and structured extension rules.

4. Canonicalize shared data structures.
   Baskets and wallet receipts should have explicit uniqueness/nonzero laws.

5. Add protocol-law proof hooks.
   Keep generic laws in the kernel, but give each actor a standard way to prove
   DEX reserve/LP laws or DAO supply/position laws.

6. Regrow examples after the seed changes.
   Rebuild DEX and DAO examples using SPI-100 for accounts, protocol-local blob
   nodes for LP/stake/position identities, SPI-101 for local wallet holdings,
   SPI-103 for ICRC movement, and SPI-102 only for local transitions.

7. Expand client tests.
   Add larger discovery graphs, pagination, guard-failure
   variants, multiple pending positions, partial claims, unsupported ledgers,
   and registered accounts across all SPIs.

8. Keep verifier limitations in notes.
   Do not make the seeds uglier to satisfy current proof gaps. Record the SR9
   limitation, isolate the trusted island, and keep the intended kernel clean.

## Bottom Line

The approach is working. The examples are doing their job: they are showing
which seeds are strong and which ones need to change.

SPI-100 is close. SPI-101 needs a wallet kernel. SPI-103 needs real-ledger
tests. SPI-102 is the right model, but should not freeze until discovery,
intent, guard errors, baskets, and accounting-law hooks are stronger.
