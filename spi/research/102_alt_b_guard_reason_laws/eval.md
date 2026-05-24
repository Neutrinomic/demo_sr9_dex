# 102-B Evaluation

Status: pass. Kernel, proof observers, DAO actor, DEX actor, and runtime tests
all pass.

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 4 | Execute rejects stale quotes, failed guards, insufficient input, and unauthorized callers before mutation. |
| provability | 4 | Guard reason predicates, DAO conservation, DEX conservation, and both actors verify. |
| client usability | 5 | Clients can distinguish deadline, min receive, max spend, and max fee failures. |
| implementability | 4 | Reason ordering is simple and actor code stays readable after trimming the DAO graph. |
| kernel usefulness | 4 | Guard reason, receipt acceptance, DAO conservation, and DEX conservation hooks are reusable. |
| simplicity | 4 | Adds reason variants and protocol-law hooks, but keeps the same discover/quote/execute trio. |
| cleanliness | 4 | Reason types are quarantined in the alternative profile. |
| extensibility | 4 | Protocol-specific reason remains available without replacing generic reasons. |
| footgun resistance | 4 | Clients no longer need to guess why a guard failed, and failed execute preserves wallet-visible state. |
| runtime coverage | 5 | Harness covers DAO pending transition, every generic guard reason, stale quote rejection, failed execute preserving wallet-visible state, and the separate DEX conservation example. |
| verifier ergonomics | 3 | Array helpers and receipt array copying remain trusted, but both protocol actors verify. |

## Occam Analysis

The simplest path is keeping a single `#guardRejected`; this alternative rejects
that because client recovery differs by failure reason. It adds only a reason
payload and a fixed check order, not a broader error hierarchy.

## Command Results

Verification:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/Types.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/proofs/GuardReasonObservers.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/examples/GuardReasonDexActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify-timeout-ms 120000 --deterministic --verify reference/dex/spi/research/102_alt_b_guard_reason_laws/examples/GuardReasonDaoActor.sr9
```

All verification commands succeeded.

Runtime:

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/102_alt_b_guard_reason_laws/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/102_alt_b_guard_reason_laws/test/config.json bun run shared/harness/runner/runE2E.ts
```

Result: `Suites: 1 ok, 0 fail | Tests: 5 ok, 0 fail, 0 skipped`.
Report:
`test/reports/runs/2026-05-22T02-53-30Z/test-results.md`.

## Recommendation

Keep this as the SPI-102 guard-reason profile. It is now verified enough to
regrow against canonical examples, but the base SPI-102 seed should still weigh
the extra observable API surface against the client recovery benefit.
