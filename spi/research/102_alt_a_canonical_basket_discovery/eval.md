# 102-A Evaluation

Status: pass. Kernel, DEX actor, DAO actor, proof observers, and runtime tests
all pass. Generic unbounded injective projection-key uniqueness is proved.

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 4 | Execute rechecks authorization, edge, live quote, guard, and balances. |
| provability | 4 | Kernel postconditions, fixed-shape basket/graph laws, generic projection-array laws, DEX actor, and DAO actor verify. Record-array guard scans remain trusted. |
| client usability | 5 | Discovery describes nodes and edges; tests assert every edge references known nodes. |
| implementability | 4 | Actors stay small by using kernel guard and binding helpers. |
| kernel usefulness | 5 | Discovery, quote, receipt, guard, scalar graph laws, and generic projection-key laws are reusable by actor ensures. |
| simplicity | 5 | Exact baskets and a two-edge DAO graph are the simplest useful local transition models. |
| cleanliness | 4 | Graph semantics are separate from DEX and DAO state mutation. |
| extensibility | 4 | Same shape can add more protocol-specific edges once proof branches are isolated. |
| footgun resistance | 4 | Clients get node metadata, execute does not trust discovery/quote blindly, and projected graph ids have uniqueness/page-disjoint laws. |
| runtime coverage | 5 | Harness covers discovery node descriptions, edge references, DEX add liquidity/swap, wallet impact, guard rejection, DAO stake, and DAO pending-unstake. |
| verifier ergonomics | 3 | Trusted basket iteration and trusted quote-to-receipt array copy remain limitations. |

## Occam Analysis

The simplest useful DEX graph is three nodes and two edges. The simplest useful
DAO graph is liquid, staked, pending-unstake with `stake` and `request-unstake`.
That gives clients the intended discover/quote/execute shape without adding
extra cancel/claim branches before the proof model is strong enough.

## Command Results

Verification:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_a_canonical_basket_discovery/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_a_canonical_basket_discovery/examples/CanonicalBasketDexActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_a_canonical_basket_discovery/proofs/BasketDiscoveryObservers.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify-timeout-ms 120000 --deterministic --verify reference/dex/spi/research/102_alt_a_canonical_basket_discovery/examples/CanonicalBasketDaoActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/102/Kernel.sr9
```

All verification commands succeeded.

Runtime:

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/102_alt_a_canonical_basket_discovery/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/102_alt_a_canonical_basket_discovery/test/config.json bun run shared/harness/runner/runE2E.ts
```

Result: `Suites: 1 ok, 0 fail | Tests: 3 ok, 0 fail, 0 skipped`.
Report:
`test/reports/runs/2026-05-22T02-53-11Z/test-results.md`.

## Remaining Limitation

Generic basket and discovery uniqueness now verifies over scalar injective
projection arrays. A direct `[BasketEntry]` or `[DiscoveryEdge]` predicate still
fails at type checking because quantifier `pure func` closures cannot capture
record-array parameters when used as predicate function results.

## Recommendation

Keep this as the SPI-102 base seed: discover nodes/edges, quote canonical
baskets, execute with kernel guards, and use projection keys for large
discovery pages. Grow larger DAO transition graphs by giving every page a stable
projection order instead of relying on direct record-array predicates.
