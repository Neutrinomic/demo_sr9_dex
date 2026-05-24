# SR9 Ergonomics Notes From SPI Kernel Research

These notes summarize language and verifier improvements that would make SR9
much better for building verified protocol kernels like SPI-100, SPI-101,
SPI-102, and SPI-103.

## 1. Direct Record-Array Predicates

The biggest ergonomic gap is reusable predicates over immutable arrays of DTO
records.

What we wanted:

```motoko
public pure func basketCanonical(entries : [BasketEntry]) : Bool {
  forall<Nat>(pure func (i : Nat) : Bool =
    i < entries.size() ==> entries[i].amount > 0)
}
```

What happened:

- A `pure func` used inside `forall` cannot capture the array parameter when the
  quantifier is packaged as a reusable predicate result.
- Lemmas that require quantified facts over `[Record]` arrays can still fail to
  prove postconditions because array element record-field permissions are not
  available in the postcondition.

Why it matters:

SPI kernels naturally want predicates like "canonical basket", "no duplicate
node ids", "every edge endpoint is described", and "page has no duplicate
entries". These are generic record-array properties.

Current workaround:

Use scalar projection arrays: protocols expose stable injective `Nat` keys for
nodes/edges, and the kernel proves uniqueness over `[Nat]`. This is sound and
verified, but it adds boilerplate and moves some proof responsibility to each
protocol.

SR9 improvement:

- Add a stable immutable array model, similar to `BSeq.Spec.model`, for ordinary
  arrays.
- Let pure quantifier closures capture immutable array parameters safely.
- Self-frame read permissions for record fields used in array contracts.
- Provide standard lemmas for `array.length`, `array.get`, `array.map`, and
  projected uniqueness.

## 2. Finite-Map Baskets As A Library Pattern

SPI-102 baskets are finite maps from `NodeId` to `Nat`, but today they are DTO
arrays for Candid/client usability.

What we wanted:

- Prove `basketAmount`.
- Prove `basketContains`.
- Prove no duplicate nodes and no zero amounts.
- Reuse those facts in `guardAccepts`.

What happened:

The natural scan helpers still need `trusted` because nested loops over arrays
of records are too expensive or lose permissions.

SR9 improvement:

- Provide a standard verified "array DTO as finite map" library.
- Support a pattern like:

```motoko
type Entry<K, V> = { key : K; value : V };
canonical(entries, compare)
amount(entries, key)
contains(available, required)
```

- Include lemmas that connect sorted unique arrays to map membership and sums.

This would remove a major trusted boundary from SPI-102.

## 3. Projection Keys Should Be First-Class

Projection keys were the cleanest workaround for generic SPI-102 uniqueness.
The language could make this pattern much nicer.

Useful SR9 feature:

```motoko
projection NodeIdKey for NodeId : Nat {
  injective;
  total;
}
```

Then the verifier could use:

- sorted projected keys imply no duplicate source ids;
- page boundary on projected keys implies no overlap;
- projection equality implies source equality.

Today we write that convention in comments/specs and prove only the scalar side.

## 4. Invariant Bundles

Actors with maps repeatedly need facts like:

```motoko
BMap.orderedBy<Principal, Nat>(balances, Principal.compare)
```

Putting these in every method postcondition creates noise and makes examples
feel heavier than the protocol logic.

SR9 improvement:

- Better actor/module invariant syntax for owned state.
- Automatic preservation obligations for helpers that modify that state.
- Named invariant bundles that can be imported by examples:

```motoko
invariant BalanceBookWellFormed {
  orderedBy(balances);
  allBalancesNonnegative;
}
```

The user-facing code should read like protocol logic, with storage invariants
kept in one place.

## 5. Trusted Code Should Carry More Structure

Some `trusted` functions are unavoidable during research, but they currently
look too similar whether they are:

- a small model bridge;
- a runtime trap/mock shim;
- an unverified algorithm;
- a temporary verifier workaround.

SR9 improvement:

- Add trusted categories or annotations:

```motoko
trusted(reason = "array-scan-verifier-gap", issue = "sr9-array-record-scan")
```

- Allow "trusted spec only" wrappers where implementation is ordinary code but
  the postcondition is assumed.
- Report trusted surface area in verification output.

This would keep kernels honest and make research artifacts easier to audit.

## 6. Async Phase Reasoning

SPI-103 showed that pre-await equality is often the wrong property. The sound
shape is post-await repair:

- reserve before await;
- after await, inspect current local state;
- on failure, restore the reserved debit onto current state.

SR9 improvement:

- Provide language/library patterns for async phases:

```motoko
phase preawait reserve(...)
phase postawait success(...)
phase postawait failure_restore(...)
```

- Make the verifier guide users away from unsound pre-await equality claims.
- Add helpers for "current state plus reserved delta" reasoning.

This would make bridge canisters much easier to verify.

## 7. Rich-Value BMap Support

The operation-id alternative wanted `BMap<Nat, OperationStatus>`, but rich
variant values caused verifier trouble. We used a bounded slot map instead.

SR9 improvement:

- Strengthen BMap support for variant/record values.
- Provide map-update lemmas that do not explode on rich value domains.
- Make model equality and `get` facts cheaper for domain-specific variants.

Without this, realistic idempotency tables become more awkward than they should
be.

## 8. DTO Construction Should Be Cheap

Discovery responses build nested records and arrays of records. These are
semantically boring, but they can be expensive for the solver.

SR9 improvement:

- Treat immutable DTO construction as a low-cost proof pattern.
- Add constructor summaries for record literals and array literals.
- Avoid backend cancellation on large but straightforward Candid DTO returns.

Protocol examples should not need to trust a whole query method just because it
returns a rich response object.

## 9. Better Callable Summaries

Higher-order helpers and callbacks are useful for generic kernels, maps, folds,
and adapters. The callable summary work should make it easy to pass local pure
functions with captures while preserving contracts.

Needed improvements:

- Clearer syntax for contracted local functions.
- Better diagnostics when a callback is rejected as not proven pure.
- Summaries that preserve captured immutable locals without forcing awkward
trusted wrappers.

This matters for generic scans, projections, folds, and route composition.

## 10. Core Byte/Blob/Principal Lemmas

SPI-100 needed compact account encoding, base58check text, CRC checksums, and
principal/blob roundtrips. The design is good, but deeper proofs need stronger
core facts.

Useful lemmas:

- `Blob.fromArray` length and element facts.
- `Blob.slice` composition facts.
- `Principal.fromBlob(Principal.toBlob(p)) == p`.
- Imported constant stability in downstream contracts.
- Checksum encode/decode algebra over byte arrays.

These would reduce trusted codec boundaries and make account no-collision
proofs more direct.

## 11. Diagnostics Should Suggest The Proof Shape

The best verifier messages were the ones that pointed toward the right modeling
surface. The worst ones said only that a postcondition might not hold, even
when the real issue was record-array permissions or callback purity.

Better diagnostics should say:

- "This record-array quantifier cannot be packaged as a pure predicate; try an
  array model or scalar projection."
- "This postcondition needs array element field permissions; use a sequence
  model or project the field first."
- "This BMap value type is too rich for the current map proof path; use a
  scalar model or bounded map."

Good diagnostics are part of language ergonomics.

## 12. Proof Kits For Protocol Kernels

The SPI approach worked well: specs define public DTOs, kernels define reusable
predicates/lemmas, and actors import kernels instead of re-proving every fact.

SR9 could support this style directly with proof kits:

- account authorization kit;
- receipt binding kit;
- guard acceptance kit;
- finite-map basket kit;
- pagination/cursor kit;
- async bridge kit;
- idempotency operation-table kit.

Each kit should include:

- types or typeclass-style requirements;
- predicates;
- lemmas;
- observer examples;
- minimal runtime/client tests.

That would make verified canister development more repeatable and less bespoke.

## Summary

The SPI research suggests SR9 is strong enough for useful verified protocol
kernels today, but the ergonomics can improve a lot around generic arrays,
record DTOs, map summaries, and async phase reasoning.

The highest leverage SR9 improvements are:

1. Direct immutable record-array predicate support.
2. A verified DTO-array finite-map library.
3. First-class injective projection keys.
4. Stronger actor invariant bundles.
5. Better structured trusted annotations.
6. Rich-value BMap verification.
7. Async phase proof helpers.

Those would let us keep SPI kernels clean while removing most of the remaining
trusted/projection boilerplate from the examples.
