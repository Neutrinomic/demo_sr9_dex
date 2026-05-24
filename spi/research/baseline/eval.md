# Baseline Evaluation

Status: pass as a baseline, not a final design.

## Command Results

Verification:

```text
spi/101/Wallet.sr9       PASS
spi/102/Types.sr9        PASS
spi/102/Kernel.sr9       PASS
spi/103/ICRCBridge.sr9   PASS
spi/103/Kernel.sr9       PASS
```

Runtime:

```text
cd reference/dex && bun run test:spi103
Suites: 1 ok, 0 fail | Tests: 4 ok, 0 fail, 0 skipped
Report: reports/runs/2026-05-22T00-45-19Z/test-results.md
```

## Scores

| Category | Score | Evidence |
|---|---:|---|
| security | 3 | SPI-103 covers authorization and fee debit; SPI-101 wallet laws are mostly prose. |
| provability | 3 | 102 and 103 kernels verify; 101 has no wallet well-formedness kernel. |
| client usability | 3 | SPI-103 has client tests; 101 and current 102 alternatives need regrown tests. |
| implementability | 4 | Current 103 example is easy to implement; real ledger awaits remain separate work. |
| kernel usefulness | 3 | 102 and 103 kernels help actors; 101 lacks one. |
| simplicity | 4 | The 101 wallet / 103 bridge split is simpler than the retired mixed 101 surface. |
| cleanliness | 3 | Canonical files are clean, but historical 102 examples still use retired shapes. |
| extensibility | 4 | Separate wallet, bridge, and transition surfaces compose well. |
| footgun resistance | 3 | Account/node/ledger split is clearer; wallet duplicate/nonzero laws are not enforced. |
| runtime coverage | 2 | Only SPI-103 has current passing client tests. |
| verifier ergonomics | 3 | Kernel predicates work, but basket scans and wallet export laws still need trusted helpers. |

## Occam Analysis

The simplest viable design is the current split:

```text
SPI-101 = wallet query
SPI-102 = local atomic transitions
SPI-103 = ICRC bridge
```

This is simpler than making SPI-101 own deposits and withdrawals, because ICRC
semantics are only one bridge family. The baseline should stay as the control
case, but the alternatives must test whether more kernel structure can improve
proof support without adding too much ceremony.

## Baseline Weaknesses

- SPI-101 has no kernel for wallet receipt well-formedness.
- SPI-101 has no standalone current client harness.
- SPI-103 tests use a simulated bridge, not real mock-ledger await behavior.
- SPI-102 canonical examples/tests are historical and stale.
- Discovery, basket, and wallet uniqueness laws are not strong enough.

## Recommendation

Use this baseline only as the control. The research alternatives should try to
keep the same simple surface while strengthening kernels and examples.
