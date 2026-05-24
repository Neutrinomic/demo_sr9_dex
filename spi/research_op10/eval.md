# OP10 SPI Kernel Research Evaluation

Status: focused second pass complete, with canonical promotion applied for the
verified simple improvements.

## Score Summary

| Area | Alternative | Status | Security | Provability | Client UX | Simplicity | Verifier |
|---|---|---|---:|---:|---:|---:|---:|
| baseline | canonical kernels | pass | 4 | 4 | 4 | 4 | 4 |
| 101 | direct wallet array laws | partial, not promoted | 4 | 3 | 4 | 4 | 3 |
| 102 | caller quote/execute wrappers | pass, promoted | 4 | 4 | 5 | 5 | 4 |
| 103 | receipt session laws | pass, promoted | 4 | 5 | 4 | 5 | 5 |

## Decisions

SPI-101: no canonical change. The old direct record-array predicate limitation
still exists, so wallet entry array well-formedness should not be promoted yet.

SPI-102: promote caller-oriented wrappers. They let actors use the natural
`caller` API while the kernel still reasons internally over the explicit
authorization boolean. This improves actor proof ergonomics without changing
the public SPI-102 API.

SPI-103: promote pending-withdrawal session laws. These encode the async bridge
shape OP10 wants: reserve locally, await external ledger, then settle or restore
using scalar session/receipt evidence.

## Promotion Applied

Promoted into canonical files:

- `reference/dex/spi/102/Kernel.sr9`
- `reference/dex/spi/103/Kernel.sr9`

Verified after promotion:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/101/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/102/Kernel.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/103/Kernel.sr9
```

All three succeeded.

## Follow-up Work

- Regenerated SPI-102 examples now verify against the current SPI-100 account,
  SPI-101 wallet, SPI-102 transition, and SPI-103 bridge split.
- Add direct record-array predicate support in SR9 before replacing SPI-102
  projection-key laws or trusted basket finite-map scans.
- Consider a later SPI-103 example that models the real awaited ledger flow with
  pending session evidence rather than only local demo accounting.
