# SR9 DEX Demo

This is a demo. It is not production ready, not audited for mainnet custody,
and not a reference implementation of a decentralized exchange.

The purpose of this repository is to show how SR9 verification can be used to
build a serious protocol-shaped application with executable code, contracts,
module boundaries, async ledger calls, and machine-checked proof obligations.
It is a working research/demo artifact for verified DEX design, not something
to deploy with real user funds.

## What This Demonstrates

This demo models a local-balance DEX that interacts with external ICRC-style
ledgers. Users deposit tokens into local balances, swap deposited balances
through constant-product pools, add or remove liquidity, and withdraw back to
external ledgers.

The important point is not that this is a complete exchange. The important
point is that the implementation carries executable contracts that SR9 lowers
to Viper and verifies. The code is structured so client-facing behavior,
accounting transitions, AMM math, pending async operations, and observer proofs
are checked as part of the normal development workflow.

## What Is Verified

The current verified surface includes these guarantees:

- Deposits credit a user only after the ledger `transfer_from` returns success.
- Withdrawals debit local balance before the external ledger call and restore
  the exact pending debit if the ledger returns an error or rejects.
- Forced ledger returns use pending state and restore the exact pending local
  balance if the external transfer fails.
- Swaps use only deposited local balances.
- Swap execution recomputes against current pool reserves and enforces
  `minAmountOut`.
- Quote and swap receipts expose the same constant-product output formula.
- Successful swaps cannot drain the output reserve.
- The 0.3% swap fee is split into platform and LP portions, with exact receipt
  equations for the split.
- Platform fees are credited to the controller's local account.
- Liquidity add/remove operations use local balances and virtual LP-share
  balances.
- Initial and existing liquidity adds prove useful share/leftover facts.
- Pool health facts are exposed: live share-bearing pools have positive
  reserves, zero-share pools have zero reserves, and locked shares are bounded
  by total shares.
- Pool creation is controller-only and requires two different active ledgers.
- Ledger lifecycle operations are controller-only.
- Retiring ledgers reject final removal while pools, local balances, pending
  withdrawals, pending returns, or in-flight deposits still exist.
- Balance totals are cached and checked through module contracts.
- Pending deposit, withdrawal, and return modules enforce one active operation
  per relevant key.
- Round-trip observers prove deposit/withdraw shapes do not create extra local
  tokens beyond the modeled ledger-fee behavior.
- Attack observers cover bounded same-pool closed-loop action shapes for
  add/remove/swap receipt arithmetic.

## Guardrails

The demo intentionally keeps several controls visible:

- The DEX actor is a persistent actor class and takes the controller principal
  during initialization.
- DEX state is persistent actor state, not transient state.
- External ledgers are built from principals through the minimal ICRC ledger
  interface.
- Admin actions are controller-gated.
- Ledgers must be whitelisted before pools or swaps use them.
- Retiring ledgers can be drained but cannot accept new pool exposure.
- Async ledger calls are split into local begin/finish transitions so errors
  and rejects have explicit recovery paths.
- Public query surfaces are separated from accounting facts; core accounting
  relies on verified totals and local transition contracts.

## Remaining Non-Production Risks

The following are known reasons this is still a demo:

- The DEX trusts whitelisted external ledgers to behave like standard truthful
  ICRC ledgers.
- Pool removal still contains a trusted proof boundary.
- Some listing/holder discovery helpers are trusted proof boundaries.
- Dust balances can block retiring-ledger cleanup.
- Locked-liquidity shutdown policy is still a protocol-design choice.
- Outbound duplicate-transfer semantics need a clearer production policy.
- Upgrade and external-ledger reconciliation procedures are not productionized.

These are protocol and verifier-workflow items to resolve before treating this
as custody software.

## Why SR9 Matters Here

SR9 lets the implementation carry executable contracts next to the code that
mutates balances, pools, pending operations, and ledger accounting. That gives
three practical benefits:

- Engineers and AI coding agents get local proof failures when they break an
  accounting guarantee.
- Protocol invariants are documented as code, not only as prose.
- Refactors can be gated by verifier runs over the real protocol modules and
  proof observers.

For AI coders, the rule is simple: do not weaken contracts, add `trusted`, or
change protocol behavior to make verification pass. If a proof gets hard, keep
the runtime behavior intact, add local assertions or stronger module
postconditions, and record verifier limitations separately.

## Verification

These timings were measured on 2026-05-17 in the SR9 workspace with:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify <target>
```

They are wall-clock seconds from this machine and cache state, not a portable
benchmark. The important column is that every target currently verifies.

| Target | Current result | Seconds |
| --- | ---: | ---: |
| `lib/Types.sr9` | PASS | 0.349 |
| `lib/AssetKey.sr9` | PASS | 0.729 |
| `lib/AssetTotals.sr9` | PASS | 8.521 |
| `lib/BalanceBook.sr9` | PASS | 16.102 |
| `lib/LedgerSet.sr9` | PASS | 7.031 |
| `lib/InFlightDeposits.sr9` | PASS | 5.708 |
| `lib/PendingWithdrawals.sr9` | PASS | 7.000 |
| `lib/PendingReturns.sr9` | PASS | 7.069 |
| `lib/LedgerAccounting.sr9` | PASS | 5.809 |
| `lib/AmmMath.sr9` | PASS | 0.882 |
| `lib/Pool.sr9` | PASS | 1.198 |
| `lib/PoolRegistry.sr9` | PASS | 42.214 |
| `lib/Dex.sr9` | PASS | 138.929 |
| `proofs/InvariantObservers.sr9` | PASS | 167.695 |
| `proofs/LedgerRoundTripObservers.sr9` | PASS | 170.662 |
| `proofs/AttackObservers.sr9` | PASS | 1.220 |
| `DexActorDemo.sr9` | PASS | 197.151 |

## Development Rule

Any change to the DEX logic should keep the full table green. If a verifier
change is required, keep DEX behavior as the regression workload and fix the
generic verifier capability rather than adding DEX-specific compiler behavior.
