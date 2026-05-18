# DEX2 Implementation Todo

This file tracks the current state of `playground/invar/dex2/spec.md`.
It is intentionally a live engineering checklist, not the original build plan.

OP5 verifier-performance work has landed and OP7 listing/settlement support is
available. Transitive VPR item slicing is default-on. DEX2 work can continue
with normal focused verification again, but still record timing data for large
proof changes because DEX2 remains a heavy protocol-scale file.

## Current Reality

- [x] Runtime module layout exists under `playground/invar/dex2/lib/`.
- [x] Actor surface exists in `DexActorDemo.sr9`.
- [x] Public user funcs are wired: `deposit`, `withdraw`, `quote`, `swap`,
  `liquidity`, `balances`, `pools`.
- [x] Controller funcs are wired: `controller_ledger`, `createPool`,
  `removePool`, `returnLedgerBalances`.
- [x] External ledgers are built from `ICRCLedger.fromPrincipal`.
- [x] Deposit credits local balance only after `icrc2_transfer_from` returns
  `#Ok`.
- [x] Withdraw debits before the await, uses pending state, and restores the
  exact pending debit on ledger error or reject.
- [x] Forced return uses pending state and restores the exact pending local
  balance on ledger error or reject.
- [x] Query funcs return payloads directly, not `Result`.
- [x] Pools are represented as virtual balance keys, so LP shares appear in
  user balances.
- [x] Platform fees are credited to the controller local balance during swaps.
- [x] Ledger lifecycle has active/retiring removal flow.
- [x] Pool removal is controller-only, requires successful registry deletion,
  and converts user LP shares back into local token balances.
- [x] Performance notes and minimal repros are recorded:
  `playground/invar/dex2/notes.md` and
  `playground/invar/repro/perf_declonly/`.
- [x] Source audit found no imports of `UserBalances.sr9` or `LedgerOps.sr9`
  from the active DEX2 code; both unused files were removed on 2026-05-17.
- [x] OP5 performance fixes are implemented in the translator: MVIR-only opaque
  summary imports, prepared-unit caching, effective spec metadata caching,
  wrapper pruning, and default transitive VPR item slicing.

## Current Verification State

- [x] Concrete `Dex.sr9` and `DexActorDemo.sr9` verification pass with OP5
  defaults after the 2026-05-17 cleanup.
- [x] Raw Silicon over emitted DEX VPR passed. OP5 kept raw Silicon in the same
  order of magnitude and reduced DEX2 generation/lowering substantially.
- [x] Current active DEX2 trusted count is 0. OP7 removed the previous five
  trusted cuts:
  `BalanceBook.balances`, `BalanceBook.holders`,
  `BalanceBook.firstNonControllerHolder`, `PoolRegistry.list`, and
  `Dex.removePool`.
- [x] Re-run full `DexActorDemo.sr9` verification now that OP5 performance
  fixes are default-on.
- [x] Keep `notes.md` updated immediately when a verifier bug, unsoundness
  concern, or bad ergonomics issue blocks a real proof.
- [x] No new DEX2 `trusted` functions were added during the 2026-05-17 cleanup
  or the 2026-05-18 OP7 cleanup.
- [x] OP7 follow-up listing payload contracts verify: `BalanceBook.balances`,
  `BalanceBook.holders`, `BalanceBook.firstNonControllerHolder`, and
  `PoolRegistry.list` expose useful facts about every returned entry; the pool
  list health facts also lift through `Dex.pools` and `DexActorDemo.pools`.
- [x] Post-OP7 pool listing canonical-key contract verifies: every pool listed
  by `PoolRegistry.list`, `Dex.pools`, and `DexActorDemo.pools` proves
  `info.key == AssetKey.pool(info.ledgerA, info.ledgerB)`.

## OP5 Performance Status And DEX2 Verification Lane

- [x] Profiled DEX VPR generation with `S9_VIPER_TIMING=1`.
- [x] Identified the dominant cost as declaration-only pure/spec contract
  emission during lowering, not Silicon solving.
- [x] Added minimal repro for local decl-only metadata widening:
  `playground/invar/repro/perf_declonly/local_pure_bmap_late_global.mo`.
- [x] Added minimal repro for direct opaque imports being translated twice:
  `playground/invar/repro/perf_declonly/opaque_double_import.mo`.
- [x] OP5 replaced the old opaque-summary translation hot path with an MVIR-only
  summary path and shared artifact builder.
- [x] OP5 added session-local prepared-unit caching.
- [x] OP5 added effective spec metadata caching and consolidated spec
  specialization onto the canonical helper path.
- [x] OP5 added shared reference/dependency analysis, wrapper pruning, and
  conservative transitive VPR item slicing.
- [x] Transitive slicing is now default-on. Do not use the removed
  `S9_VIPER_TRANSITIVE_SLICE=1` rollout flag.
- [x] `S9_VIPER_DISABLE_TRANSITIVE_SLICE=1` remains only as a debug comparison
  escape hatch when isolating slicer regressions.
- [x] Re-run DEX2 module and actor verification lanes with the default OP5
  pipeline, then record the exact command, result, wall time, and largest
  `S9_VIPER_TIMING` stages in `notes.md`.
- [ ] If DEX2 verification still feels too slow for the next proof slice,
  profile with `S9_VIPER_TIMING=1` and compare only as needed with
  `S9_VIPER_DISABLE_TRANSITIVE_SLICE=1`; do not add DEX-specific translator
  branches.

## Module Status

### Public Types And Keys

- [x] `Types.sr9` contains the actor result, request, receipt, and custom error
  variants.
- [x] `Types.sr9` reuses ICRC ledger transfer error types.
- [x] `AssetKey.sr9` creates ledger keys and canonical pool keys using
  `Principal.compare`.
- [x] Strengthen `AssetKey.sr9` postconditions with exact key/canonical facts
  where useful facts should be available to clients.
- [x] Verify `AssetKey.sr9` directly after strengthening.
- [x] Direct `Types.sr9` verification passes with OP5 defaults, so no empty
  harness is needed for this pass.

### Balances And Totals

- [x] `AssetTotals.sr9` exists and is used by `PoolRegistry`.
- [x] `UserBalances.sr9` was removed; the active path is the flat
  `BalanceBook`.
- [x] `BalanceBook.sr9` is the active per-user balance module.
- [x] `BalanceBook` tracks flat `(user,key)` balances and cached totals.
- [x] `BalanceBook.credit` and `BalanceBook.debit` prove exact local and total
  deltas.
- [x] `BalanceBook.credit` and `BalanceBook.debit` preserve every other raw
  per-user record key in `model(book)`.
- [x] `BalanceBook.total` is verified without `trusted`.
- [x] Removed `UserBalances.sr9`; the current active path is the flat
  `BalanceBook`.
- [x] Remove trusted cuts from `BalanceBook.balances`,
  `BalanceBook.holders`, and `BalanceBook.firstNonControllerHolder`.
- [x] Retried removing the BalanceBook listing/holder trusted cuts on
  2026-05-17; they still hit opaque frame/permission limits recorded in
  `notes.md`.
- [x] Removed the BalanceBook listing/holder trusted cuts on 2026-05-18 after
  OP7 added read-only owner scan framing and exact sequence/listing support.
- [x] Prove useful listing guarantees for balances and holders, or explicitly
  document that list ordering/duplication is a runtime-only surface while
  accounting proofs rely on totals.
- [x] `BalanceBook.balances` now proves every returned entry is positive and
  matches the model for the requested user/key; `holders` and
  `firstNonControllerHolder` prove positive-balance holder facts.

### Ledger Lifecycle And Pending State

- [x] `LedgerSet.sr9` implements `#active`, `#retiring`, and cached fees.
- [x] `InFlightDeposits.sr9` tracks deposit guards by ledger key.
- [x] `PendingWithdrawals.sr9` tracks one pending withdrawal per user/ledger.
- [x] `PendingReturns.sr9` tracks one pending forced return per user/ledger.
- [x] `LedgerAccounting.sr9` records inflow/outflow and net values.
- [x] Strengthen `LedgerAccounting` inflow/outflow observers so callers can use
  exact snapshot values.
- [ ] Strengthen `LedgerAccounting` so `net` is not just locally nonnegative
  but is useful in the top-level conservation invariant.
- [x] Added import-safe `LedgerAccounting.settled` plus conditional exact net
  delta facts on `recordDeposit`, `recordWithdraw`, and `recordForcedReturn`.
  A stronger public `net` observer contract is blocked by an imported
  child-opaque permission issue recorded in `notes.md`.
- [x] Strengthen pending module contracts around exact `recordKey`, `empty`,
  `total`, and withdrawal `has` facts.
- [x] Strengthen pending module contracts around exact failed `take` behavior.
- [x] Verify changed pending/accounting/key modules independently with OP5
  defaults before relying on their contracts in new observers.

### AMM Math

- [x] `AmmMath.sr9` implements 0.3% swap fee split.
- [x] Fee split proves:
  `platformFee + lpFee == fee` and
  `effectiveAmountIn + platformFee + lpFee == amountIn`.
- [x] `quoteExactIn`, add-liquidity planning, remove-liquidity planning, and
  `sqrtFloor` are implemented.
- [x] Re-check whether `sqrtFloor` verifies in the normal lane with OP5
  defaults. Keep it implemented; do not replace it with `trusted`.
- [x] Add stronger AMM facts for LP shares:
  proportional add, bounded leftovers, and remove share bounds.
- [x] Add quote/swap consistency facts: fee split equations, stale-plan reserve
  rejection, and successful swap reserve-before/after receipt equations.
- [x] Successful quote receipts now expose reserve health:
  quoted input/output reserves are positive and `amountOut <= reserveOut`.
- [x] Successful swap plans and receipts now expose reserve health:
  execution reserves are positive, `amountOut > 0`, and `amountOut` is strictly
  less than the pre-swap output reserve, so a successful swap cannot drain the
  output side.
- [x] Successful quote and swap receipts now expose the exact formula:
  `amountOut == AmmMath.quoteExactIn(reserveIn, reserveOut, effectiveAmountIn)`
  using the reserve snapshot carried by the receipt.

### Pools And Registry

- [x] `Pool.sr9` has opaque pool state with ledger pair, reserves, total shares,
  and locked shares.
- [x] Pool invariants prevent same-ledger pools and half-empty live pools.
- [x] `Pool.info` now exposes those health facts to callers:
  locked shares are bounded by total shares, zero-share pools have zero reserves
  and zero locked shares, and live share-bearing pools have positive reserves.
- [x] Pool planning/apply funcs exist for quote, swap, add, and remove.
- [x] `PoolRegistry.sr9` stores pools by canonical pool key.
- [x] `PoolRegistry` tracks reserve totals with `AssetTotals`.
- [x] `PoolRegistry` routes swaps in both directions.
- [x] `PoolRegistry` tracks share supply and locked share supply.
- [x] Remove trusted cut from `PoolRegistry.list`.
- [x] Retried removing the `PoolRegistry.list` trusted cut on 2026-05-17; it
  still fails on read-only model framing and opaque handle policy constraints
  recorded in `notes.md`.
- [x] Removed the `PoolRegistry.list` trusted cut on 2026-05-18 after OP7; the
  scan keeps explicit field-level frames and observes pools through
  `Pool.info`.
- [ ] Strengthen registry facts for `containsLedger`, reserve totals, share
  totals, and pool deletion.
- [x] `PoolRegistry.containsLedger` now has an import-safe exact contract:
  `containsLedger(registry, ledger) == (ledgerPoolCount(registry, ledger) > 0)`.
  This verifies through `PoolRegistry.sr9`, `Dex.sr9`, and `DexActorDemo.sr9`.
- [x] `PoolRegistry.ledgerPoolCount` now exposes the exact cached count read,
  and the private count update helper exposes exact same-key and other-key map
  update facts.
- [x] Successful `PoolRegistry.createPool` now proves both input ledgers are
  contained in the registry; `Dex.createPool` and `DexActorDemo.createPool`
  lift this via `Dex.ledgerHasPool`.
- [x] Successful `PoolRegistry.deletePool` now proves exact ledger pool-count
  decrements for the removed pool's two ledgers.
- [x] Retried exact `old(count) + 1` postconditions for successful
  `PoolRegistry.createPool`; body-level count assertions verify, but exporting
  the old-snapshot delta still fails, so the public contract keeps the weaker
  `containsLedger` guarantee and the limitation is recorded in `notes.md`.
- [x] `PoolRegistry.planSwap`, `planAdd`, and `planRemove` now expose canonical
  pool-key facts: successful plans have
  `plan.poolKey == AssetKey.pool(requestLedgerA, requestLedgerB)`. The registry
  also defensively rejects stored pools whose internal key does not match the
  map key.
- [x] `PoolRegistry.createPool` now exposes an exact empty-pool receipt surface:
  successful creation returns the canonical pool key with zero reserves, zero
  total shares, and zero locked shares.
- [x] `PoolRegistry.quote` now explicitly frames reserve totals for both
  quoted ledgers, which lets the top-level `Dex.quote` conservation facts
  verify.
- [x] `PoolRegistry.lockedShareSupply` now proves
  `lockedShareSupply <= totalShareSupply`, and `Dex.lpLockedWithinSupply`
  exposes the same share-total bound at the top level.
- [x] `PoolRegistry.getInfo` and `getInfoByKey` now expose the pool health
  facts proven by `Pool.info`: locked shares are bounded by total shares,
  empty pools have zero reserves and zero locked shares, and live share-bearing
  pools have positive reserves.
- [x] `PoolRegistry.list`, `Dex.pools`, and `DexActorDemo.pools` now expose the
  same pool health facts for every returned pool info entry.
- [x] `PoolRegistry.list` filters internally inconsistent pool records and
  proves every returned pool info key is canonical for its ledger pair; this
  lifts through `Dex.pools` and `DexActorDemo.pools`.
- [x] `PoolRegistry.getInfo`, `getInfoByKey`, and `deletePool` now reject
  internally inconsistent map entries whose stored pool key does not match the
  lookup key, and successful results expose the canonical key.
- [x] `Pool.planRemove` now exports the successful slippage guarantee
  (`amountA >= minAmountA` and `amountB >= minAmountB`), and
  `PoolRegistry.planRemove` lifts it through canonical pool ordering.
- [x] `PoolRegistry.planAdd` now exposes canonical max accounting:
  `used + leftover` equals the caller's max amounts in the returned pool order.
- [x] `Pool.planAdd` and `PoolRegistry.planAdd` now expose that successful add
  plans mint at least `minShares`.
- [x] Successful add-liquidity plans and receipts now prove they use positive
  amounts of both pool tokens.
- [x] Successful remove-liquidity plans now prove they burn a positive number
  of shares from a live pool and the requested shares are within current supply
  at planning time.
- [x] Pool-level remove-liquidity planning now rejects attempts to burn through
  locked LP shares, and successful `Pool.applyRemove` exposes the same
  `shares + lockedShares <= totalShares` fact at the leaf boundary.
- [x] Successful add-liquidity plans and receipts now expose that locked shares
  are either zero or exactly `AmmMath.minimumLiquidity()`. This is lifted
  through `PoolRegistry`, `Dex.liquidity`, and `DexActorDemo.liquidity`.
- [x] Retried exact reserve-total facts for successful `PoolRegistry.deletePool`;
  they still fail even though `AssetTotals.debit` exposes exact deltas. The
  limitation is recorded in `notes.md`.
- [x] Successful `PoolRegistry.deletePool` now exposes canonical deleted-pool
  info and the same pool-health facts as `getInfo`, even though exact reserve
  total deltas remain blocked.
- [x] Make quote/swap proof surface state explicitly that the applied swap is
  the current quote at execution time.
- [x] `PoolRegistry.planSwap`, `PoolRegistry.applySwap`, `Dex.swap`, and
  `DexActorDemo.swap` now expose the successful swap non-drain facts:
  positive reserves, positive output, and `amountOut < reserveOutBefore`.
- [x] `PoolRegistry.quote`, `PoolRegistry.planSwap`, `PoolRegistry.applySwap`,
  `Dex.quote`, `Dex.swap`, `DexActorDemo.quote`, and `DexActorDemo.swap` expose
  exact `AmmMath.quoteExactIn` result facts for quote/swap consistency.

### Top-Level Dex State

- [x] `Dex.sr9` is the cross-module coordinator.
- [x] `Dex.State` owns controller, ledgers, balances, pools, accounting,
  pending withdrawals, pending returns, and in-flight deposits.
- [x] `Dex` exposes local transitions for deposit, withdraw, return balances,
  swap, liquidity, pool creation/removal, and ledger lifecycle.
- [x] `accountingBalanced` helper exists:
  `ledgerNet == localObligation + pendingOut`.
- [x] `lpSupplyBalanced` helper exists:
  pool total shares equal user LP balances plus locked shares.
- [ ] Turn accounting conservation into a strong invariant or into transition
  postconditions that are strong enough for observers.
- [ ] Turn LP supply balance into a strong invariant or into transition
  postconditions that are strong enough for observers.
- [x] Strengthen `Dex` summary observers (`ledgerNet`, `localObligation`,
  `pendingOut`, `lpSupplyBalanced`) with exact equations.
- [x] Strengthen successful deposit postconditions with exact local balance
  credit facts.
- [x] Strengthen successful deposit postconditions and observers with exact
  direct-ledger local total, local obligation, and pending-out facts.
- [x] Strengthen quote postconditions and observers so every quote result,
  including expected errors, preserves ledger net, local obligation, and
  pending-out for both touched ledgers. The same guarantee is exposed on
  `DexActorDemo.quote`.
- [x] Strengthen successful pool-creation postconditions so `Dex.createPool`
  and `DexActorDemo.createPool` expose the canonical empty-pool receipt.
- [x] `Dex.createPool` and `DexActorDemo.createPool` now expose that successful
  creation marks both input ledgers as having at least one pool via
  `Dex.ledgerHasPool`.
- [x] Strengthen ledger lifecycle transitions so `controllerAddLedger`,
  `controllerRetireLedger`, and `controllerRemoveLedger` preserve direct local
  totals, local obligation, pending-out, and ledger net for the touched ledger.
  Observer wrappers verify for add and retire; the remove wrapper import is
  blocked and documented in `notes.md`, while the DEX contract itself verifies.
- [x] Strengthen successful liquidity postconditions with exact caller
  pool-share virtual balance deltas when the pool-share record key is distinct
  from the real-ledger record keys.
- [x] Add `Dex.ledgerSettled` and a conditional successful-deposit net delta:
  if ledger accounting was settled before the deposit, `ledgerNet` increases by
  the deposited amount.
- [x] Remove trusted cut from `Dex.removePool`.
- [x] Retried removing the `Dex.removePool` trusted cut on 2026-05-17; it still
  fails on top-level controller/owner framing after pool deletion, recorded in
  `notes.md`.
- [x] Removed the `Dex.removePool` trusted cut on 2026-05-18. The verified
  implementation now gates settlement on successful `PoolRegistry.deletePool`
  instead of ignoring the delete result.
- [x] Strengthen actor-facing ensures beyond controller preservation where the
  verifier can use them cheaply.
- [x] Expose the successful liquidity LP-share delta guarantee on
  `DexActorDemo.liquidity`, under the same raw record-key distinctness condition
  used by the internal `Dex.liquidity` contract.
- [x] Expose liquidity slippage/leftover guarantees on `Dex.liquidity` and
  `DexActorDemo.liquidity`: successful add receipts prove
  `used + leftover == max` in canonical pool order, and successful remove
  receipts prove the returned amounts satisfy the caller's minimums.
- [x] `Dex.liquidity` and `DexActorDemo.liquidity` now expose the canonical
  pool key on successful add/remove receipts; add receipts prove
  `shares >= minShares`, and remove receipts prove `shares == requested`.

### Ledger Async Boundary And Actor

- [x] `DexActorDemo.sr9` performs the external ledger awaits directly.
- [x] Every external ledger await is wrapped in `try/catch`.
- [x] Add-ledger reads and caches `icrc1_fee`.
- [x] Deposit uses `icrc2_transfer_from`.
- [x] Withdraw uses cached fee and `icrc1_transfer`.
- [x] Bad fee refresh logic exists for transfer errors.
- [x] Actor comments describe each public function's spec behavior.
- [x] Source audit confirms ledger reject/error paths call cleanup:
  - deposit reject/error ends the in-flight deposit guard;
  - withdraw reject/error takes the pending withdrawal and credits the full
    pending debit back;
  - forced return reject/error takes the pending return and credits the full
    local balance back;
  - controller add-ledger does not mutate state before the remote fee read.
- [x] Removed `LedgerOps.sr9`; the actor owns the external await flow for this
  pass.
- [x] Re-run actor verification with OP5 defaults.

## Proof Observers

- [x] Create `playground/invar/dex2/proofs/InvariantObservers.sr9`.
- [x] Prove swap and liquidity preserve real-ledger net accounting for touched
  ledgers.
- [ ] Prove every successful local transition preserves accounting
  conservation.
- [x] Prove successful deposit moves direct-ledger accounting exactly:
  user-local total and local obligation increase by `amount`, while
  `pendingOut` is unchanged.
- [x] Prove successful deposit preserves the full accounting balance equation
  when the ledger starts settled:
  `ledgerNet == localObligation + pendingOut` remains true.
- [x] Added verified accounting-conservation arithmetic kernels for unchanged
  deltas, deposit deltas, moving local balance into pending withdrawals,
  settling pending withdrawals, refunding pending withdrawals/returns, and
  moving value between user local totals and pool reserves. These capture the
  equations needed by successful and failed local transitions without relying on
  currently blocked parent/child opaque summary framing.
- [x] Added verified obligation-preservation kernels for pool-local moves:
  local-to-reserve and reserve-to-local deltas preserve `localObligation`, and
  unchanged `ledgerNet`/`pendingOut` then preserves the full accounting balance
  equation.
- [x] Prove deposit precheck and failed deposit completion branches preserve
  direct-ledger local totals, local obligation, pending-out, and ledger net.
- [x] Prove quote, including expected failure branches, preserves direct local
  accounting for both touched ledgers.
- [x] Prove controller add-ledger and retire-ledger local accounting
  preservation through `InvariantObservers.sr9`.
- [x] Add verified lifecycle observers proving successful pool creation marks
  both ledgers as pooled and successful controller ledger removal leaves the
  removed ledger with no pools.
- [ ] Prove every expected failure branch leaves conservation unchanged.
- [x] Prove failed `swap` preserves the caller's input-token local balance;
  this covers precheck failures, insufficient local balance, and the stale-plan
  refund branch. The same guarantee is exposed on `DexActorDemo.swap`.
- [ ] Prove LP supply balance preservation for add/remove liquidity and pool
  removal.
- [x] Add verified LP-supply preservation arithmetic kernels for add/remove
  deltas: if total supply, user shares, and locked shares move by the expected
  mint/burn amounts, then `totalShares == userShares + lockedShares` is
  preserved.
- [x] Add verified LP-supply preservation arithmetic kernel for pool removal:
  once all user-held and locked shares are burned and the pool supply is zero,
  `totalShares == userShares + lockedShares` is discharged for that pool.
- [x] Prove add/remove liquidity move the caller's virtual pool-share balance
  exactly, under raw record-key distinctness conditions.
- [x] Create `playground/invar/dex2/proofs/LedgerRoundTripObservers.sr9`.
- [x] Prove successful local deposit credit and accepted pre-await withdrawal
  debit facts.
- [x] Prove successful deposit then successful withdraw cannot increase local
  tokens, ignoring the one ledger withdrawal fee the user pays.
- [x] Prove failed withdraw restores the exact pending debit.
- [x] Prove failed forced return restores the exact pending local balance.
- [x] Prove failed withdraw and failed forced return do not change ledger net;
  this is exposed on the local Dex cleanup functions and the round-trip
  observers. Aggregate local-obligation/pending-out cleanup remains blocked by
  the documented summary-total retention limitation.
- [x] Create `playground/invar/dex2/proofs/AttackObservers.sr9`.
- [x] Add the first verified same-pool no-profit kernel: a two-swap
  A-to-B then B-to-A round trip whose target-side pool reserve is restored
  returns at most the original target-token input; the gap is the first
  platform fee. A balance-level wrapper proves `afterTarget <= beforeTarget`
  from the matching public-user balance equation.
- [x] Add verified add/remove liquidity no-profit kernels for the depth-2
  add-then-remove case: if removing the same user-held shares returns no more
  of ledger A/B than the add spent, the caller's corresponding local balance
  cannot increase.
- [x] Add bounded target-delta no-profit composition kernels for depths 1, 2,
  3, and 4, plus receipt-to-delta helpers for swap input/output and
  add/remove liquidity ledger A/B effects.
- [x] Prove bounded same-pool closed-loop no-profit observers for action depths
  1, 2, 3, and 4 using `swap`, `liquidity(#add)`, and `liquidity(#rem)`.
- [x] Added concrete receipt-level same-pool no-profit observers for depth-1
  single spend actions, depth-2 swap-back/add-remove loops, depth-3
  swap-input/add/remove loops, and depth-4 swap-back/add/remove loops. These
  prove target-balance non-increase from the action receipts and closed balance
  equations; the remaining unchecked item is the fuller symbolic action-list
  wiring over all operation combinations.
- [x] Added a `PublicAction` variant over successful `swap`, `liquidity(#add)`,
  and `liquidity(#rem)` receipts, plus `publicActionClosedLoopNoProfitDepth1`
  through `publicActionClosedLoopNoProfitDepth4`. These derive target-token
  spend/receive deltas from arbitrary bounded public-action sequences and prove
  `afterTarget <= beforeTarget` from the closed-loop balance equation.
- [x] Extended the same public-action no-profit observer shape through depth 6
  after OP7; direct `AttackObservers.sr9` verification passes.
- [x] Keep the current attack observer kernels same-pool only for this pass.

## Cleanup

- [x] Remove unused files and modules after deciding the final architecture:
  removed `UserBalances.sr9` and `LedgerOps.sr9`.
- [x] Remove all DEX2 `trusted` functions.
- [x] Replace remaining literal weak `ensures true` contracts in active DEX2
  code. `PendingWithdrawals.get` and `PendingReturns.get` now guarantee that
  non-null records carry positive pending amounts; stronger exact null/value
  facts are blocked on import and recorded in `notes.md`.
- [x] Update `spec.md` for deliberate implementation deviations:
  flat `BalanceBook`, actor-owned async flow, and any final decision on helper
  modules.
- [x] Run focused verification with OP5 defaults:
  `XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/DexActorDemo.sr9`.
- [x] Verify proof observer files one by one.
- [x] Mark this todo after each completed step instead of leaving historical
  unchecked items behind.

## Fast Next Steps

1. Try one narrow state-level conservation transition at a time once the
   parent/child opaque summary retention issues are fixed or a smaller summary
   module is available.
2. Strengthen the BalanceBook total/local consistency story so LP-share debit
   success can be asserted directly in settlement loops.
3. Keep running `DexActorDemo.sr9` after each proof-surface change and append
   any new verifier limitation to `notes.md`.
