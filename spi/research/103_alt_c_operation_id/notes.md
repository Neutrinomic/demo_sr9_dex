# Notes

- No trusted helpers were added.
- The first implementation used `BMap<Nat, OperationStatus>`. Verification
  failed in `BMap.get` with `Prim.vmap_get: default value unsupported for
  abstract/domain types` because `OperationStatus` carries rich receipt records.
  The alternative now uses a four-slot bounded operation book with verified
  slot well-formedness, duplicate-id prevention, `get`, and `put` laws. This is
  enough to exercise multiple operation ids without relying on the unsupported
  rich-value `BMap` shape.
- Operation ids are globally unique within the example actor. A production
  profile should likely scope ids by account or caller to avoid accidental
  collisions between clients and should return to an unbounded map once the
  verifier supports this value shape.
- The example uses a simulated ledger result so idempotency can be verified
  without the async limitations found in 103-B.
