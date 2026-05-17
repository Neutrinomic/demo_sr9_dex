# DEX2 Audit Executive Summary

Date: 2026-05-17

Follow-up update: the original audit found `DexActorDemo` using `transient var dex` and a hard-coded controller. Both have now been changed: state is persistent (`var dex`) and the controller is an actor-class init argument. Targeted verification of `DexActorDemo.sr9` succeeded after the changes.

Inputs:
- `sub1.md`: ledger boundary, async deposit/withdraw/return, reentrancy, fee and lifecycle handling.
- `sub2.md`: AMM math, quote/swap/liquidity, LP shares, rounding, fee split, no-profit proof surface.
- `sub3.md`: access control, whitelist lifecycle, balance model, trusted cleanup cuts, spec/code mismatches.

Verification was not run during this audit pass. Per instruction, the DEX2 files were treated as already verified and passing; this report is a security/code/spec review.

## Overall Assessment

No subreport found an immediate permissionless theft path for an arbitrary public caller under the intended assumptions: an honest controller, only truthful standard ICRC ledgers whitelisted, and ordinary verified state transitions.

The main risks are production and lifecycle risks, not simple swap arithmetic bugs. The highest concern is that cleanup and operational authority still sit behind trusted or governance-dependent boundaries:

- ledger correctness is an external trust assumption;
- pool removal is trusted, list-driven, and ignores registry deletion failure;
- dust can permanently block ledger retirement cleanup;
- locked-liquidity shutdown value currently goes to the controller.

Before using this actor shape with real funds, treat these as launch blockers unless they are intentionally accepted and documented as governance trust.

## Resolved During Follow-Up

### Transient DEX state

Reference: `DexActorDemo.sr9:32-33`.

The initial audit found `DexActorDemo` storing full DEX state as:

```motoko
let controller : Principal = Principal.fromBlob(("\01" : Blob));
transient var dex : Dex.State = Dex.empty(controller);
```

This has been changed to:

```motoko
var dex : Dex.State = Dex.empty(controller);
```

Targeted verification succeeded after the change:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 4 --verify playground/invar/dex2/DexActorDemo.sr9
```

Remaining production work: define and test explicit state migration/reconciliation for upgrades, especially because real tokens live in external ledger canisters while local obligations live in this actor state.

### Hard-coded controller

Reference: `DexActorDemo.sr9:10`, `DexActorDemo.sr9:32`.

The initial audit found the controller fixed to:

```motoko
let controller : Principal = Principal.fromBlob(("\01" : Blob));
```

This has been changed to an init argument on the persistent actor class:

```motoko
persistent actor class DexActorDemo(controller : Principal) {
  var dex : Dex.State = Dex.empty(controller);
```

Targeted verification succeeded after adding the actor-class argument and the required `reads controller` frames.

## High Severity

### Pool removal mutates balances before an unchecked delete

References: `Dex.sr9:365`, `Dex.sr9:394-434`, `PoolRegistry.sr9:618-680`.

`Dex.removePool` is trusted, settles LP holders by scanning `BalanceBook.holders`, credits underlying token balances, credits locked-share leftovers to the controller, and then calls:

```motoko
ignore PoolRegistry.deletePool(dex.pools, ledgerA, ledgerB);
```

`PoolRegistry.deletePool` can return `null` if pool state, reserve totals, or pool-count summaries are inconsistent. Ignoring that result creates a fail-open path: users/controller may be credited underlying balances while the pool remains in the registry with stale reserves.

Recommendation:
- Never ignore `deletePool`.
- Make deletion failure impossible through a stronger infallible helper, or perform a preflight that proves deletion will succeed before settling balances.
- Add post-settlement checks such as `burnedUserShares + lockedShares == totalShares`, `BalanceBook.total(poolKey) == 0`, and exact reserve-credit totals before returning `#ok`.
- Remove or narrow the trusted cut around `Dex.removePool`.

### Malicious or misconfigured whitelisted ledgers can drain paired honest assets

References: `DexActorDemo.sr9:73-82`, `Dex.sr9:505-535`, `spec.md` trust assumptions.

Deposits credit local balances after a remote ledger returns `#Ok`. The DEX cannot independently prove the remote canister actually moved tokens. If a fake ledger is whitelisted and paired with an honest ledger, an attacker can deposit fake local balance, swap it through a pool, and withdraw honest tokens.

This is outside the verified local model but inside the operational security boundary.

Recommendation:
- Treat ledger admission as governance-critical.
- Pin known ledger principals and expected metadata/root-of-trust.
- Add reconciliation checks comparing external `icrc1_balance_of(DEX)` to local obligations before enabling pools or large swaps for a new ledger.
- Consider a quarantine state where newly added ledgers allow deposit/withdraw only, with no pool creation or swaps until accounting checks pass.

### Locked-liquidity reserves are credited to the controller on pool removal

References: `Dex.sr9:426-430`.

Normal user liquidity removal cannot burn through locked shares, but controller pool removal credits all remaining reserves represented by locked shares to the controller's local token balances. If `removePool` is allowed on active pools, this is a governance-controlled extraction path from value that LPs may consider permanently locked.

Recommendation:
- Require pool/ledger retirement before pool removal, or add an explicit pool retirement state.
- Define locked-liquidity ownership in `spec.md`.
- Consider pro-rata shutdown distribution, a non-withdrawable protocol sink, or an explicit governance fee disclosure instead of silently crediting controller local balances.

## Medium Severity

### Dust can permanently block ledger retirement cleanup

References: `Dex.sr9:315-317`, `Dex.sr9:616-619`, `Dex.sr9:782-805`.

Final ledger removal refuses any remaining local balance. User withdrawals require `amount + fee <= localBalance`, and forced return fails when `localBalance <= fee`. A dust balance can therefore become unwithdrawable and block `controller_ledger(#rem)` forever. Because `returnLedgerBalances` chooses the first non-controller holder, one dust holder can also block forced returns for later larger holders.

Recommendation:
- Add an explicit dust policy before production: controller-subsidized return, user top-up, opt-in burn/donation, or auditable dust escrow/sweep.
- Add a cursor/skip mechanism so one dust holder does not block cleanup for other holders.
- Include controller fee balances in cleanup planning, since `returnLedgerBalances` deliberately skips the controller.

### Trusted holder/listing cuts are cleanup-critical

References: `BalanceBook.sr9:159-225`, `PoolRegistry.sr9:721-741`, `spec.todo.md:48-53`.

The current trusted count is five:

- `BalanceBook.balances`
- `BalanceBook.holders`
- `BalanceBook.firstNonControllerHolder`
- `PoolRegistry.list`
- `Dex.removePool`

`holders` and `firstNonControllerHolder` are not just UI helpers. They drive pool settlement and forced returns. If holder enumeration omits a positive LP holder, pool removal can strand or destroy that holder's virtual LP claim. If first-holder lookup misses users, cleanup can stall or report no user while balances remain.

Recommendation:
- Prove holder completeness and uniqueness properties, or maintain an authoritative per-key holder set.
- For pool removal, verify that listed holder balances sum to the total user LP supply before deletion.
- Keep public `balances()` and `pools()` documented as snapshots unless their completeness is proven.

### Outbound `#Duplicate` handling depends on ledger semantics

References: `DexActorDemo.sr9:113-119`, `DexActorDemo.sr9:412-418`, `Dex.sr9:704-711`, `Dex.sr9:901-908`.

Outbound withdraw and forced-return transfers send `memo = null` and `created_at_time = null`. All transfer `#Err` values, including `#Duplicate`, are treated as failures and refund the pending local debit.

For standard ledgers this should not normally produce `#Duplicate` without an idempotency key, but if a ledger returns `#Duplicate` for a transfer that was already accepted, the DEX would refund local balance while the user may already have received the external transfer.

Recommendation:
- Either make outbound transfers explicitly idempotent with a persisted nonce and reconcile matching duplicates as success, or require whitelisted ledgers not to return `#Duplicate` for non-idempotent outbound calls.
- Document this as part of the ledger whitelist contract.

### Closed-loop no-profit observers are arithmetic kernels, not full economic proofs

References: `proofs/AttackObservers.sr9`, `spec.md` observer scope.

The current observers are useful, but several important facts are preconditions: closed balance equations, same-pool scope, reserve-restoration facts, and receipt inequalities. They should not be described as a global proof that arbitrary add/remove/swap sequences cannot profit.

Recommendation:
- Label these observers as scoped proof kernels.
- Add stateful observers that execute real `Dex.swap` and `Dex.liquidity` transitions and derive the needed inequalities from receipts and state deltas.
- Keep cross-pool or external-price no-arbitrage claims out of scope.

## Lower Severity / Operational Risks

- External ledgers going offline can leave in-flight async operations pending and block ledger removal checks that require no pending deposit/withdraw/return state.
- Public `quote` results are only previews. `swap` correctly recomputes against current reserves and enforces `minAmountOut`, but clients must not treat quote `#ok` alone as execution certainty.
- Integer fee flooring means very small swaps can pay zero swap fee. Constant-product output flooring appears to prevent direct same-pool extraction, but this should remain covered by stateful no-profit tests.
- Principal/text keying relies on `Principal.toText` behavior for balance keys and pool keys. If representation changes across runtime/compiler versions, migrations need explicit care.

## Recommended Fix Order

1. Define explicit state migration/reconciliation for upgrades before any real funds.
2. Fix `removePool`: do not ignore `deletePool`, define locked-share shutdown ownership, and add exact settlement checks.
3. Add dust cleanup policy and a forced-return cursor/skip path.
4. Reduce trusted cleanup cuts, starting with holder completeness for LP settlement.
5. Strengthen ledger admission with metadata/root checks and optional external balance reconciliation.
6. Decide and document outbound duplicate/idempotency semantics.
7. Expand stateful observers from arithmetic kernels into end-to-end transition properties.

## Report Disposition

The subreports are consistent: no immediate public-user theft path was identified under the current trust assumptions. The original transient-state and hard-coded-controller issues have been fixed and verified, but the DEX is not ready to be treated as production custody code until pool-removal, dust, ledger-trust, and migration/reconciliation issues are resolved or explicitly accepted.
