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

## Feature Highlights

- Controlled or DAO-operated administration: the actor takes a controller
  principal at initialization. That principal can be a human-controlled
  principal, an operations canister, or a DAO/governance canister.
- Ledger allowlist lifecycle: the controller can add ledgers, retire ledgers,
  and finally remove drained retiring ledgers.
- Pool lifecycle: the controller can create pools between two active,
  whitelisted ledgers and can remove pools during cleanup.
- Safe ledger retirement flow: a ledger cannot be removed while pools still use
  it, while users still have local balances, or while deposits, withdrawals, or
  forced returns are pending.
- User fund return during cleanup: when a ledger is retiring, the controller can
  run forced returns that move a user's full local balance into pending state,
  send the withdrawable amount back through the external ledger, and restore the
  exact local balance if the ledger call fails or rejects.
- LP settlement on pool removal: pool deletion must succeed before user-held
  virtual LP-share balances are burned into local token balances, so cleanup is
  modeled as a guarded conversion of user claims rather than a silent deletion.
- Virtual ledgers for LP positions: pool shares live in the same local balance
  book as real ledger balances, which makes user portfolio views and proof
  accounting use one model.
- Constant-product AMM math: quotes and swaps use the same exact-in formula,
  and swaps execute against the current reserve snapshot rather than trusting a
  stale quote.
- Slippage guardrails: swaps and liquidity operations carry minimum-output or
  minimum-share constraints.
- Fee split: swaps charge 0.3%. Of that fee, 20% is credited to the controller's
  local input-ledger balance as the platform fee, and 80% stays in the pool as
  LP value.
- Cached ledger fees: a ledger's transfer fee is read when the ledger is added
  and refreshed if a standard ledger reports `#BadFee { expected_fee }`.

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
  equations for the split: 20% of the fee goes to the controller as platform
  fee, and 80% remains in the pool for LPs.
- Platform fees are credited to the controller's local account.
- Liquidity add/remove operations use local balances and virtual LP-share
  balances.
- Initial and existing liquidity adds prove useful share/leftover facts.
- Pool health facts are exposed: live share-bearing pools have positive
  reserves, zero-share pools have zero reserves, and locked shares are bounded
  by total shares.
- Pool creation is controller-only and requires two different active ledgers.
- Ledger lifecycle operations are controller-only: add, retire, and final
  removal of ledgers are gated by the configured controller/DAO principal.
- Retiring ledgers reject final removal while pools, local balances, pending
  withdrawals, pending returns, or in-flight deposits still exist.
- Pool removal converts user LP positions back into local token balances before
  deleting the pool.
- Balance totals are cached and checked through module contracts.
- Balance listing surfaces prove every returned entry is positive and matches
  the underlying model for that user/key.
- Holder listing surfaces prove every returned holder has a positive balance
  for the requested asset key.
- Pool listing surfaces prove every returned pool info entry satisfies the same
  pool-health facts as direct pool lookup, and every listed pool key is
  canonical for its ledger pair.
- Pending deposit, withdrawal, and return modules enforce one active operation
  per relevant key.
- Round-trip observers prove deposit/withdraw shapes do not create extra local
  tokens beyond the modeled ledger-fee behavior.
- Attack observers cover bounded same-pool closed-loop action shapes through
  depth 5 for add/remove/swap receipt arithmetic.
- The active DEX2 source has no `trusted` functions; the previous listing and
  pool-removal proof cuts are now verified.

## Guardrails

The demo intentionally keeps several controls visible:

- The DEX actor is a persistent actor class and takes the controller principal
  during initialization.
- DEX state is persistent actor state, not transient state.
- External ledgers are built from principals through the minimal ICRC ledger
  interface.
- Admin actions are controller-gated.
- Ledgers must be whitelisted before pools or swaps use them.
- Retiring ledgers can be drained but cannot accept new pool exposure, and final
  removal is blocked until all pools, balances, and pending operations are gone.
- Async ledger calls are split into local begin/finish transitions so errors
  and rejects have explicit recovery paths.
- Public query surfaces are separated from accounting facts; core accounting
  relies on verified totals and local transition contracts.
- Read-only listing helpers are verified without `trusted`, including balance
  listings, LP-holder discovery, pool listings, and pool-removal settlement.

## Remaining Non-Production Risks

The following are known reasons this is still a demo:

- The DEX trusts whitelisted external ledgers to behave like standard truthful
  ICRC ledgers.
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

These timings were measured on 2026-05-18 in the SR9 workspace with the full
DEX2 gate:

```bash
JOBS=4 XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1 ./scripts/run-op6-dex2-gate.sh
```

They are per-target `verify.pipeline_viper_files` seconds from this machine and
cache state, not a portable benchmark. The important column is that every
target currently verifies.

| Target | Current result | Seconds |
| --- | ---: | ---: |
| `core/src/Principal.sr9` | PASS | 0.281 |
| `core/src/pattern/ICRCLedger.sr9` | PASS | 0.312 |
| `lib/Types.sr9` | PASS | 0.287 |
| `lib/AssetKey.sr9` | PASS | 0.713 |
| `lib/AssetTotals.sr9` | PASS | 10.888 |
| `lib/BalanceBook.sr9` | PASS | 20.213 |
| `lib/LedgerSet.sr9` | PASS | 8.849 |
| `lib/InFlightDeposits.sr9` | PASS | 7.577 |
| `lib/PendingWithdrawals.sr9` | PASS | 9.243 |
| `lib/PendingReturns.sr9` | PASS | 9.218 |
| `lib/LedgerAccounting.sr9` | PASS | 7.665 |
| `lib/AmmMath.sr9` | PASS | 0.879 |
| `lib/Pool.sr9` | PASS | 1.259 |
| `lib/PoolRegistry.sr9` | PASS | 54.795 |
| `lib/Dex.sr9` | PASS | 180.460 |
| `proofs/InvariantObservers.sr9` | PASS | 210.685 |
| `proofs/LedgerRoundTripObservers.sr9` | PASS | 202.062 |
| `proofs/AttackObservers.sr9` | PASS | 1.162 |
| `DexActorDemo.sr9` | PASS | 210.238 |

## Development Rule

Any change to the DEX logic should keep the full table green. If a verifier
change is required, keep DEX behavior as the regression workload and fix the
generic verifier capability rather than adding DEX-specific compiler behavior.
