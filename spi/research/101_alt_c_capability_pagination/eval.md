# 101-C Evaluation

Status: pass with cursor-window no-duplicate scan laws.

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 4 | Successful pages require account visibility. |
| provability | 4 | Cursor monotonicity and fixed scan range disjointness verify. |
| client usability | 3 | Pagination helps; invalid cursor/filter errors are too coarse. |
| implementability | 4 | Fixed cursor checkpoints are simple. |
| kernel usefulness | 4 | Capability and cursor predicates are reusable. |
| simplicity | 4 | Monotonic cursor law avoids heavier scan proofs. |
| cleanliness | 3 | Reusing account authorization error for cursor/filter is not ideal. |
| extensibility | 4 | Can grow into richer pagination. |
| footgun resistance | 4 | The full fixed scan proves it does not revisit an index. |
| runtime coverage | 4 | Harness covers full scan, stable reconstruction, invalid cursor/filter, and unauthorized caller. |
| verifier ergonomics | 4 | Verified without trusted helpers after making kernel predicates expose their boolean definitions. |

## Occam Analysis

The simplest useful pagination law is monotonic `nextCursor`. The alternative
now adds the next-smallest proof: fixed cursor windows are disjoint, without
introducing generic array scans.

## Command Results

Verification:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_c_capability_pagination/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_c_capability_pagination/examples/PaginatedWalletActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/101_alt_c_capability_pagination/proofs/PaginationObservers.sr9
```

All three verification commands succeeded.

Runtime:

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/101_alt_c_capability_pagination/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/101_alt_c_capability_pagination/test/config.json bun run shared/harness/runner/runE2E.ts
```

Result: `Suites: 1 ok, 0 fail | Tests: 2 ok, 0 fail, 0 skipped`.
Report: `reports/runs/2026-05-22T02-32-04Z/test-results.md`.

## Cleanup Notes

The verifier needed scalar cursor state to be named before record construction.
No trusted helpers were added. The uniqueness proof is intentionally over fixed
cursor windows rather than generic arrays.
