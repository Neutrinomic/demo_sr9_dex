# Baseline Evaluation

## Result

The canonical SPI-101, SPI-102, and SPI-103 kernels verify.

## Scores

| Area | Status | Security | Provability | Client UX | Simplicity | Verifier |
|---|---|---:|---:|---:|---:|---:|
| SPI-101 kernel | pass | 4 | 4 | 4 | 5 | 4 |
| SPI-102 kernel | pass | 4 | 4 | 5 | 4 | 4 |
| SPI-103 kernel | pass | 4 | 4 | 4 | 5 | 4 |

## Weaknesses To Retest

- SPI-102 still needs trusted basket scans and quote-flow scans.
- Reusable record-array predicates over DTO arrays may still be blocked.
- SPI-103 can express pending withdraws as a session/receipt law more clearly.
- SPI-102 still needs periodic client harness retesting when the account,
  wallet, bridge, or transition DTOs change.
