# SPI-102 Verifier Notes

These are verifier or proof-automation limitations observed while hardening the
SPI-102 kernel and examples. The goal is to keep `Kernel.sr9` conceptually
clean and record places where SR9/Viper support should improve instead of
reshaping the SPI around the tool.

## Trusted Basket Scans

Current code:

- `Kernel.basketAmount`
- `Kernel.basketContains`
- `Kernel.quoteHasPositiveFlow`

Issue:

Natural loops over arrays of immutable record DTOs are hard to verify today.
The desired implementation scans receipt outputs, inputs, fees, and quote
effects. Earlier attempts at nested scans lost array element permissions across
loop invariants.

Why it matters:

These helpers encode core generic basket containment and positive quote flow.
`Kernel.guardAccepts` is now a verified wrapper with an exact Boolean
postcondition, but it still depends on the trusted basket containment scans.
They are the right shape for the kernel, but they should eventually be
mechanically proved.

Suggested verifier improvement:

- Better loop invariant inference or examples for read-only array scans.
- A stable sequence-model view for immutable arrays of records.
- Library lemmas for finite-map containment over `[BasketEntry]`.

Minimal repro shape:

```motoko
func basketContains(available : [BasketEntry], required : [BasketEntry]) : Bool {
  for (needed in required.values()) {
    if (basketAmount(available, needed.node) < needed.amount) {
      return false
    }
  };
  true
}
```

## Discovery Graph Construction

Current workaround:

The example `spi_102_discover` methods are trusted.

Issue:

Constructing full `Discovery` values with arrays of `NodeShape` and
`DiscoveryEdge` records repeatedly triggered solver/backend cancellation in the
actor examples.

Why it matters:

The spec requires discovery to return node metadata as well as edge metadata.
That is the right client-facing shape; we should not weaken discovery just to
avoid a solver timeout.

Suggested verifier improvement:

- Better handling of large immutable record literals in actor query returns.
- More predictable Silicon/Z3 behavior for nested arrays of DTO records.
- A way to mark pure DTO construction as low-cost without trusting the entire
  query method.

Minimal repro shape:

```motoko
public shared query({ caller }) func spi_102_discover(
  request : DiscoverRequest
) : async Discovery {
  {
    account = request.account;
    nodes = [nodeShape(a), nodeShape(b), nodeShape(lp)];
    edges = [
      discoveryEdge(edgeShape(...), status(...)),
      discoveryEdge(edgeShape(...), status(...))
    ];
    nextCursor = null;
    witness = null
  }
}
```

## BMap Update Wrappers

Current workaround:

The examples use trusted pure wrappers such as `mapSet`, `mapCredit`,
`mapSetNat`, and `mapSetInt`.

Issue:

The underlying `BMap.add` functions have useful model-level contracts, but the
actor examples ran into proof pressure when composing those contracts through
helper functions and actor invariants.

Why it matters:

Account-indexed maps are the realistic storage shape for protocols. We should
keep the examples realistic and improve the verifier/library proof path rather
than collapse examples back to scalar balances.

Suggested verifier improvement:

- Make common `BMap` update wrappers easy to prove without trusted adapters.
- Provide standard account-balance helpers in the library with strong contracts.
- Improve proof search around `BMap.orderedBy` preservation through pure helper
  calls.

## Actor Invariant Propagation Through Helpers

Current workaround:

The examples put all account-book ordering facts behind one aggregate predicate,
such as `orderedBooks(...)`, and use that predicate as the actor invariant.
Public methods no longer repeat individual `BMap.orderedBy(...)` postconditions
for each actor field. Single-map utilities still keep local
`BMap.orderedBy(...)` contracts because they accept arbitrary maps rather than
the whole actor book set.

Issue:

Private mutating helpers still need one compact postcondition like
`ensures orderedBooks(...)`. Without that postcondition, callers can update the
actor state through the helper but cannot reliably fold the actor invariant
after the call.

Why it matters:

This is much better than repeating all map-order facts on every public method,
but the verifier should ideally use the actor invariant and the helper body to
recover the aggregate invariant fact automatically.

Suggested verifier improvement:

- Preserve actor invariant knowledge across verified private helper calls.
- Improve modular reasoning for helpers that mutate only invariant-owned fields.
- Support a concise annotation for "this helper re-establishes the actor
  invariant" without restating the invariant predicate as an explicit
  postcondition.

## Pro-Rata LP Withdrawal Math

Current workaround:

`DexPrincipalLpActor.removeOut` is trusted.

Issue:

The implementation guards `totalLp == 0` before dividing by `totalLp`, but the
verifier still reported possible division by zero in the branch using
`(amount * reserve) / totalLp`.

Why it matters:

Pro-rata share math is common in AMMs, vaults, staking pools, and lending
markets. We should be able to prove simple guarded division without trusting the
helper.

Suggested verifier improvement:

- Stronger path-sensitive reasoning for guarded division.
- A small arithmetic lemma pattern for `if d == 0 { ... } else { n / d }`.

Minimal repro shape:

```motoko
func proRata(amount : Nat, reserve : Nat, total : Nat) : Nat {
  if (total == 0) {
    0
  } else {
    (amount * reserve) / total
  }
}
```

## Predicate Implication Lemma

Current state:

`Kernel.executableImpliesReceiptAccepted` is now a public lemma, not a trusted
function. The kernel also has projection lemmas from `quoteReturned`,
`receiptAccepted`, and `guardAccepts` to the concrete facts callers usually need
in postconditions.

Resolved issue:

Conceptually, `executable(caller, q, guard, receipt, now, status)` implies
`receiptAccepted(caller, q, guard, receipt)` because `executable` contains
`receipt.executedAt == now` and all the predicates needed by
`receiptAccepted`. This now verifies cleanly as a kernel lemma.

Remaining issue:

Guard projection lemmas only verified after `guardAccepts` was given its exact
Boolean postcondition. The underlying basket containment facts are still backed
by the trusted array-scan helpers documented above.

Suggested verifier improvement:

- Better unfolding/rewriting for pure predicate implications.
- Keep improving lemma ergonomics for pure Boolean predicates so these
  projection lemmas stay cheap as the kernel grows.

## Solver Stability

Current workaround:

The BMap examples are verified with `--cores 1`.

Issue:

The same files can trigger solver/backend transport cancellation without
single-core verification.

Suggested verifier improvement:

- More deterministic solver scheduling for large actor proofs.
- Better retry or isolation behavior for independent methods.
