# 103-C Evaluation

Status: pass with a verified bounded operation table and a documented verifier
limitation around unbounded rich-value BMaps.

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 4 | Duplicate operations return stored receipts without changing balances again. |
| provability | 4 | Idempotency laws are local and await-free. |
| client usability | 5 | Clients can retry with an operation id and query status. |
| implementability | 4 | Operation tables require cleanup and collision policy; the verified example now supports multiple ids in a bounded table. |
| kernel usefulness | 4 | Kernel isolates duplicate/no-double-credit/no-double-debit laws. |
| simplicity | 3 | More state than base SPI-103; justified only as an extension. |
| cleanliness | 4 | Extension types are separate from canonical SPI-103. |
| extensibility | 5 | Supports memo, created-at-time, and reconciliation. |
| footgun resistance | 5 | Directly addresses duplicate retry footguns. |
| runtime coverage | 4 | Harness covers duplicate deposit, duplicate withdraw, reconciliation status, and invalid operation id. |
| verifier ergonomics | 3 | Verified after replacing `BMap<Nat, OperationStatus>` with a bounded slot map due a rich-value BMap limitation. |

## Occam Analysis

The simpler SPI-103 shape cannot give idempotent client retries. This
alternative adds the smallest useful extension: operation id, status query, and
stored receipts. Memo and created-at-time are included because they map to ICRC
ledger fields and prevent a later incompatible extension.

Rejected simplification: using base SPI-103 without operation ids cannot make
client retries idempotent. Rejected complexity: `BMap<Nat, OperationStatus>`
would be the realistic unbounded storage shape, but verification currently
fails in `BMap.get` for this rich value type.

## Command Results

Verification:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/Types.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/examples/OperationBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/examples/AccountLedgerBook.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/examples/OperationIdBridgeActor.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify reference/dex/spi/research/103_alt_c_operation_id/proofs/OperationIdObservers.sr9
```

All six verification commands succeeded.

Runtime:

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=spi/research/103_alt_c_operation_id/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=spi/research/103_alt_c_operation_id/test/config.json bun run shared/harness/runner/runE2E.ts
```

Result: `Suites: 1 ok, 0 fail | Tests: 4 ok, 0 fail, 0 skipped`.
Report: `reports/runs/2026-05-22T02-11-02Z/test-results.md`.

## Recommendation

Keep operation ids as an optional SPI-103 extension. Do not force them into the
base seed until cleanup/scoping and verifier support for map-valued operation
statuses are stronger.
