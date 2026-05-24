# SPI Kernel Research Evaluation

Status: research pass complete with canonical kernel promotion applied. The
SPI-102 generic uniqueness gap is now handled with verified projection-key laws.

## Score Summary

| Area | Alternative | Status | Security | Provability | Client UX | Simplicity | Runtime | Verifier |
|---|---|---|---:|---:|---:|---:|---:|---:|
| baseline | current canonical | pass control | 3 | 3 | 3 | 4 | 2 | 3 |
| 101 | 101-A wallet well-formed | pass | 4 | 4 | 4 | 5 | 4 | 4 |
| 101 | 101-B balance book | pass with fixed export laws | 4 | 4 | 4 | 4 | 4 | 4 |
| 101 | 101-C pagination | pass with fixed scan uniqueness | 4 | 4 | 3 | 4 | 4 | 4 |
| 103 | 103-A receipt binding | pass | 4 | 4 | 4 | 5 | 4 | 4 |
| 103 | 103-B in-flight restore | pass with trusted adapters | 4 | 4 | 4 | 3 | 5 | 3 |
| 103 | 103-C operation id | pass bounded map extension | 4 | 4 | 5 | 3 | 4 | 3 |
| 102 | 102-A basket discovery | pass with projected generic laws | 4 | 4 | 5 | 5 | 5 | 4 |
| 102 | 102-B guard reasons | pass guard-reason profile | 4 | 4 | 5 | 4 | 5 | 3 |

## Winners

SPI-101 winner: `101_alt_a_wallet_wellformed`.

It is the best canonical seed because it gives the biggest verification lift
for the least surface area: account authorization, receipt binding, and entry
well-formedness predicates without new DTOs. Runner-up is `101_alt_c` for
pagination/capability laws. `101_alt_b` should stay as an implementation helper
pattern, not a spec requirement.

SPI-103 winner: `103_alt_a_receipt_binding` for the base spec.

It should absorb receipt binding, ledger-node identity, and exact fee debit
projection lemmas. Runner-up is `103_alt_c` as an optional idempotency extension,
not base SPI-103. `103_alt_b` now verifies with a sound post-await accounting
model, but still depends on trusted adapters for intentional mock rejects and
BMap balance deltas.

SPI-102 winner: `102_alt_a_canonical_basket_discovery`.

It validates the core client model: discover nodes/edges, quote a selected edge,
execute with canonical basket guards. It now also proves generic no-zero,
no-duplicate, and page-disjoint laws over protocol projection keys. Runner-up is
`102_alt_b` for guard reason UX. The guard-reason DAO and DEX actors now verify,
so the remaining decision is product/API complexity rather than proof
feasibility.

## Canonical Decisions

SPI-101 should not be redesigned. Keep the current `spi_101_wallet` shape and
add a canonical kernel based on 101-A. Then selectively add 101-C cursor laws.
Do not require every implementation to use the 101-B book.

SPI-102 should keep the `discover`, `quote`, `execute` trio. Canonical discovery
should require node descriptions for edge endpoints. Canonical execute should
keep guard checking in the kernel. Large baskets and discovery pages should use
stable injective projection keys for verified uniqueness. Guard rejection
reasons are useful but should be promoted only if the base API accepts an
observable reason ordering.

SPI-103 should keep ICRC deposit/withdraw separate from SPI-101. The base bridge
should absorb 103-A. Operation ids from 103-C should be an extension profile.
The real awaited ledger model from 103-B should become the next verifier-focused
research target.

## Promotion Applied

The passing base designs have now been promoted into canonical kernel files:

- `reference/dex/spi/101/Kernel.sr9`
- `reference/dex/spi/102/Kernel.sr9`
- `reference/dex/spi/103/Kernel.sr9`

Targeted verification succeeded for all three canonical kernels. SPI-101
absorbed the 101-A wallet predicates plus simple 101-C cursor/capability laws.
SPI-102 absorbed the discovery-returned law, explicit quote/receipt binding
postconditions, and projection-key uniqueness/page-disjoint lemmas. SPI-103
absorbed 103-A ledger-node binding lemmas for ICRC deposit and withdraw receipts.

## Promote

Promoted canonical candidates:

- `research/101_alt_a_wallet_wellformed/Kernel.sr9`
- Selected cursor predicates from `research/101_alt_c_capability_pagination/Kernel.sr9`
- `research/103_alt_a_receipt_binding/Kernel.sr9`
- `research/102_alt_a_canonical_basket_discovery/Kernel.sr9`

Retain as historical evidence:

- All `research/*/eval.md`
- All `research/*/notes.md`
- 103-B mock-ledger and bridge tests
- 102-B guard-reason tests

Regenerate or finish after canonical promotion:

- SPI-103 real-ledger await examples with a production interleaving policy

No generated fixtures were written outside their alternative fixture folders.

## Verifier Limitations

- Array scans over record arrays still require trusted basket helpers.
- Copying quote basket arrays into receipt arrays can require a small trusted
  helper with explicit binding ensures.
- Intentional actor rejects via `Runtime.trap` need trusted mock methods.
- `BMap<Nat, OperationStatus>` failed for rich/domain-like status values, so
  103-C uses a verified bounded slot map.
- Cross-await BMap balance deltas need scalar post-await adapters; pre-await
  balance equality across an `await` is not sound under actor interleaving.
- Direct SPI-102 basket/page uniqueness over arbitrary record arrays cannot be
  expressed cleanly as reusable predicate functions today: quantifier `pure
  func` closures cannot capture the record-array parameter when used as the
  function result. The verified workaround is injective projection-key arrays.

## Client Findings

- Clients strongly benefit from discovery responses including node descriptions,
  not only edge ids.
- Opaque `#guardRejected` is usable but poor for recovery; reason variants are a
  real improvement.
- SPI-103 operation ids are valuable for retry UX but should be optional because
  they add cleanup, scoping, and reconciliation policy.
- SPI-101 wallet pagination needs better error variants than reusing
  `#accountNotAuthorized` for bad cursor/filter.

## Simplest Viable Canonical Design

Keep the split:

```text
SPI-101 = account-authorized wallet query
SPI-102 = local atomic discover/quote/execute
SPI-103 = bridge profile for external ledgers
```

Accepted complexity:

- SPI-101 kernel predicates, because they make actor receipts easier to prove.
- SPI-102 discovery node descriptions, because clients need to explain graph ids.
- SPI-103 receipt binding and fee lemmas, because they catch real bridge bugs.

Rejected complexity for now:

- Mandatory operation ids in base SPI-103.
- Mandatory balance-book storage for SPI-101.
- Mandatory guard reason variants in canonical SPI-102 until the base API
  commits to their observable check order.

## Next Step

Regrow the canonical examples from the promoted kernels. The first verifier
improvement target should be direct record-array predicate support, because it
would let SPI-101 exports and SPI-102 guards avoid projection boilerplate.
