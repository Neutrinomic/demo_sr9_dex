# Notes

- `basketAmount` and `basketContains` are trusted for the same reason as the
  canonical kernel: generic array scans over record arrays are still verifier
  heavy.
- `CanonicalBasketDexActor.receiptFor` is trusted because copying quote basket
  arrays into receipt arrays currently trips array-element permission checks.
  The helper keeps explicit ensures for quote binding and execution time.
- `CanonicalBasketDaoActor.receiptForAt` uses the same trusted receipt-copy
  shape and commits local time only after all failed-execute checks have passed.
- The DEX example uses exact 1:1 transitions so basket/guard behavior is easy
  for clients to inspect.
- The kernel now has scalar fixed-shape basket and graph-id laws for positive
  amounts, distinct basket nodes, distinct graph nodes, and distinct edge ids.
- The kernel also has generic unbounded projection laws: Nat amount arrays prove
  no-zero entries, strictly sorted injective node/edge projection-key arrays
  prove no duplicates, and adjacent sorted discovery pages with a boundary key
  prove page disjointness.
- The DAO example now verifies after using the simplest useful graph:
  `stake` and `request-unstake`. The earlier four-edge version was useful for
  UX exploration, but it made the generated proof too branch-heavy.
- A direct attempt to add generic quantified array predicates for arbitrary
  `[BasketEntry]` and discovery record arrays failed because quantifier `pure
  func` closures cannot capture the record-array parameter when used as a
  predicate function result. The workaround is not a trusted uniqueness axiom:
  protocols provide stable injective Nat projection keys and the kernel proves
  the unbounded laws over those scalar arrays.

## Verifier Limitation: Generic Array Predicates

Minimal shape that fails:

```motoko
public pure func basketEntriesNonzero(entries : [Types.BasketEntry]) : Bool
  requires true;
  ensures result == (
    forall<Nat>(pure func (i : Nat) : Bool =
      i < entries.size() ==> entries[i].amount > 0)
  );
{
  forall<Nat>(pure func (i : Nat) : Bool =
    i < entries.size() ==> entries[i].amount > 0)
};
```

Observed failure: the quantifier predicate is a `pure func` closure and the
type checker rejects access to the captured `entries` parameter inside that
closure.

Why this should be lifted: SPI-102 needs reusable kernel predicates for
"canonical basket", "no duplicate node ids", and "no duplicate edge ids" over
arbitrary pages. Without this, actors can prove fixed small graphs well, but a
generic paginated graph must either use trusted scan helpers or push uniqueness
checks into less reusable actor-specific code.

Workaround used here: keep scalar fixed-shape laws for one/two-entry baskets and
two/three-node graphs, and add generic projection laws over `Nat` arrays. Do not
add trusted uniqueness axioms over record arrays; that would make client and
actor guarantees look stronger than the proof evidence.
