# DEX2 Implementation Notes

- Historical, superseded by the later `sqrtFloor` entry: the first iterative
  floor-sqrt proof could not stay `pure` because SR9 pure functions reject local
  mutable loop state, and one exact-postcondition version stalled in
  Silicon/Z3. The current `AmmMath.sqrtFloor` is a normal verified function,
  not a trusted DEX cut.

- AMM arithmetic helpers now verify without `trusted`: `min`, `splitFees`,
  `quoteExactIn`, `sqrtFloor`, `planInitialAdd`, `planExistingAdd`, and
  `planRemove`. The useful trick for guarded division is to call
  `Nat.div(numerator, denominator)` after the branch proves the denominator is
  positive. Direct `/` inside a pure branch can fail function well-formedness
  before the branch guard is applied.

- Repro for the guarded-division issue above: make
  `AmmMath.quoteExactIn` untrusted and implement the positive branch as
  `(reserveOut * effectiveAmountIn) / (reserveIn + effectiveAmountIn)`, even
  after checks for `reserveIn == 0` and `effectiveAmountIn == 0`. Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/AmmMath.sr9`.
  Failure: `Function might not be well-formed. Divisor reserveIn +
  effectiveAmountIn might be zero` in the generated Viper function. Replacing
  `/` with `Nat.div(..., reserveIn + effectiveAmountIn)` verifies because the
  call precondition is checked with the branch facts in scope.

- Historical, superseded by later Pool entries: after adding pool health
  invariants, direct verification of `Pool.sr9` initially stalled in the AMM
  mutation methods, so pool quote/plan/apply methods were temporarily trusted.
  They now verify without trusted boundaries.
  This should be narrowed later by proving `applySwap`, `applyAdd`, and
  `applyRemove` one at a time against the core arithmetic lemmas.

- A module-level `public let MINIMUM_LIQUIDITY : Nat = 1` was reported as an
  undefined identifier at the `sqrtFloor` loop site during verification. I
  replaced it with `minimumLiquidity() : Nat` returning `1`. This looks like a
  verifier/lowering name-resolution bug or poor diagnostic for module lets.

- A first pass hit `Prim.vmap_get: default value unsupported for
  abstract/domain types` around `MBMap` values that were opaque handles. I
  initially started flattening around it, but OP4 specifically added opaque
  child projection and owner-transaction support for this style. The intended
  fix is to keep the opaque module boundary and shape the maps/contracts to the
  OP4-supported owner/projection pattern instead of flattening DEX state.

- A sharper version of the same lowering limitation remains for generic map
  values that are plain record/variant domain types. OP4's positive path handles
  opaque handles inside `BMap`; it does not make `Map.get` over arbitrary record
  domain values work in `MBMap`/`BMap` generic contracts. I kept summary maps as
  `Text -> Nat` maps and represented lifecycle/pending records as parallel
  module-owned Nat maps instead of flattening the top-level DEX.

- Importing `mo:core/Error` pulled in `Error.isRetryPossible`, whose pure switch
  uses an `or` pattern that currently fails MVIR lowering (`unsupported pattern
  in pure option switch`). DEX only needs to distinguish remote rejects from
  ledger `#Err` values, so `LedgerOps` now returns a stable reject message
  without importing `Error`.

- Public `async*` functions may not mention opaque handles in their signatures,
  so `LedgerOps.deposit(dex : Dex.State, ...)` is rejected by the opaque handle
  shared-boundary policy. This is the fallback described in `spec.todo.md`:
  `LedgerOps` is remote-call-only, while `DexActorDemo.sr9` performs the local
  `Dex` pre/post transitions around each `await*`.

- A further async-module limitation appears when an imported module `async*`
  helper itself performs `await`: MVIR lowering reports
  `lower_helpers: missing $Self in translation context`. The actor now performs
  the actual ICRC awaits directly and immediately delegates all local state
  mutation to `Dex` pre/post transitions. This keeps accounting isolated while
  avoiding unsupported imported-module awaits.

- OP4's public opaque-handle policy requires the owner module to expose a
  public proof model named `model(...)`. `BalanceBook` originally exposed
  `userModel(...)`; downstream `Dex.sr9` Viper emission failed with
  "missing owner model surface" until `BalanceBook.model(...)` was added and
  `userModel(...)` became an alias. This is good policy, but the diagnostic is
  easy to miss when the module already has a domain model under another name.

- `AssetKey.canonicalA` and `AssetKey.canonicalB` had mutually-referential
  postconditions. The verifier correctly rejected this as recursive pure
  function reasoning. I weakened those postconditions for now; if ordering facts
  are needed later, they should be stated as explicit lemmas instead of making
  the pure observers recursively depend on each other.

- `BalanceBook.holders` and `PoolRegistry.list/containsLedger` cannot safely
  iterate `BMap.entries` when the map values are foreign opaque handles. The
  verifier reports a higher-order opaque-handle escape around `entries.next`.
  I added owner-maintained key logs (`holderLog` and `poolKeys`) and scan those
  keys, then re-read the authoritative current map entry. This avoids escaping
  the opaque handle iterator shape. Duplicate log entries are acceptable because
  every scan rechecks the live balance/pool before acting.

- Pure trusted observers over nested mutable maps exposed a backend bug:
  postconditions mentioning `result` from `AssetTotals.get` and
  `UserBalances.get` were copied into generated Viper `requires`, producing
  invalid Viper (`'result' can only be used in function postconditions`). I
  narrowed those observer postconditions and kept exact mutation facts on
  `credit`/`debit` boundaries instead. This should be fixed in the verifier; a
  pure observer result postcondition should not be emitted as a caller-side
  precondition.

- Constructors for opaque wrappers around `MBMap.MapMem` (`AssetTotals.empty`,
  `UserBalances.empty`) initially failed to prove their model postconditions due
  to insufficient permission for the nested map handle in the returned opaque
  record. I marked those constructors trusted temporarily. This looks like an
  owner-projection/constructor-folding gap for nested opaque fields.

- `BalanceBook.balances`, `holders`, and `firstNonControllerHolder` verify only
  as trusted boundaries right now. The non-trusted versions fail on permission
  recovery for calling `UserBalances.list` through a `BMap` value and on
  preserving `userModel` through scans. The runtime shape is straightforward;
  the verifier needs better handle-capability recovery for read-only scans over
  owner-held containers of opaque child handles.

- `PoolRegistry.sr9` now emits Viper, but full verification does not complete
  within a five-minute `--cores 8` budget even after routing methods are trusted.
  `Dex.sr9` and `DexActorDemo.sr9` also time out in Viper emission/verification
  because they import the heavy map/pool registry stack. This is currently a
  scalability issue rather than a concrete failed proof obligation. Leaf
  modules `AssetTotals.sr9`, `UserBalances.sr9`, and `BalanceBook.sr9` verify
  after the trusted boundaries above.

- Actor-level `old(...)` facts around balances are not meaningful across
  awaits, because other actor calls may interleave while the ledger call is
  pending. I kept actor `ensures` to stable facts such as the controller
  invariant and receipt/result shape, and added ghost/intermediate assertions
  around the synchronous local Dex pre/post transitions, especially withdrawal
  debit/refund accounting and swap/liquidity ledger-net preservation.

- The temporary actor-facing `lib/DexProof.sr9` scaffold has been removed.
  `DexActorDemo.sr9` now imports concrete `./lib/Dex` and verifies against the
  real DEX interface. The concrete stack still uses trusted proof cuts in
  several owner boundaries, so the result is a verified client-facing contract
  surface over the concrete runtime code, not a fully discharged implementation
  proof for every nested body.

- `scripts/verify-vpr.sh` invokes Silicon with its default
  `--numberOfParallelVerifiers 64`. On the DEX proof VPR this regularly fails
  as a Z3 interaction exception such as `push canceled`/`canceled` instead of a
  source proof error. Running the same VPR through Silicon directly with
  `--numberOfParallelVerifiers 1` gives stable, useful results:
  the old `DexProof.sr9` verified in about 12 seconds and the scaffold actor
  verified in about 14 seconds.

- The normal `sector9 --package core ./core/src --cores 1 --verify
  playground/invar/dex2/DexActorDemo.sr9` path originally timed out after four
  minutes even though the emitted VPR verified directly with one Silicon worker.
  The cause was the verifier wrapper waiting for `SiliconRunner` to exit before
  reading stdout/stderr. This DEX VPR emits about 69 KB of Silicon warnings,
  enough to fill a pipe and block the child. I patched `sector9` to write
  Silicon stdout/stderr to temporary files, wait for exit, then read the files.
  After that, the normal `sector9 --cores 1 --verify` path succeeds.

- An opaque record with only immutable fields (`DexProof.State` originally,
  and later concrete `Dex.State` before the same fix) did not get its
  `Owned$Opaque$State(...)` predicate stored in the actor invariant, so every
  imported `Dex` call failed its owned-handle precondition. Adding a tiny
  mutable `witness : Nat` field makes the actor retain the owned opaque handle,
  matching the working actor-state examples.
  This is an ergonomics/soundness-edge issue: immutable opaque values still
  generate owned-handle preconditions for module methods, but actor storage was
  not preserving the owner predicate.

- Viper generation produced duplicate identifier errors when an actor helper
  named `reject` and imported method parameters also named `reject` appeared in
  the same emitted program. Renaming the helper/parameters avoided it. The
  lowerer should hygienize source parameter names against generated/global
  method identifiers.

- Importing `PoolRegistry` and `BalanceBook` together is a verifier scalability
  hotspot. A no-op probe that imports both took roughly four minutes just to
  emit Viper, while each module emits much faster on its own. Concrete
  `Dex.sr9` and `DexActorDemo.sr9` therefore need long verification budgets
  even after most top-level DEX methods are trusted.

- Pure functions cannot have `old(...)` postconditions. Several pure trusted
  DEX observers had read-only frame clauses like `ensures model(dex) ==
  old(model(dex))`; Viper rejected those as function consistency errors. The
  frame clauses were removed and simple non-negativity/equation summaries were
  kept where they are legal.

- Exact pure observer summaries that project through child opaque fields still
  run into spec-context lowering limits. `LedgerAccounting.inflow/outflow`
  could not specify `result == AssetTotals.get(accounting.outflow, key)`, and
  `Dex.lpSupplyBalanced` could not mention `PoolRegistry.lockedShareSupply`
  through `dex.pools` in a pure postcondition. I weakened those observer specs
  and kept exact deltas on the mutator contract surface where possible.

- `UserBalances` used a parameter named `balances`, which collided with the
  actor/Dex public method named `balances` in generated Viper. Renaming the
  parameter to `ub` fixed the actor verification. The lowerer should hygienize
  method parameters against all generated method identifiers.

- The concrete DEX module currently verifies with trusted proof cuts at the
  top-level owner boundary and private fee-refresh helpers. The private helpers
  failed to recover permission for `dex.ledgers` when calling
  `LedgerSet.refreshFee`, another child opaque projection limitation.

- While trying to remove `trusted` from `AssetTotals`, a public opaque mutator
  with result-dependent postconditions reproduced the old invalid-Viper bug.
  Shape:
  `public func debit(totals, key, amount) : Bool` with postconditions like
  `ensures result ==> value(totals, key) == old(value(totals, key)) - amount`.
  Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/AssetTotals.sr9`.
  Failure: generated Viper put `result` inside method `requires`, producing
  errors such as `'result' can only be used in function postconditions` around
  generated lines for `AssetTotals$debit`. Workaround under test: make the
  primitive debit preconditioned and return `()` instead of `Bool`, so the
  exact delta does not depend on `result`.

- The same `AssetTotals` pass exposed a same-owner opaque self-call/projection
  problem. Shape: `credit`/`debit` are methods of the `AssetTotals` owner
  module and call the public helper `get(totals, key)` on the same opaque
  handle. Failure: verifier reports the precondition of `AssetTotals$get` might
  not hold because it lacks permission for `Owned$Opaque$AssetTotals(...)`,
  even though the caller is a same-module method with the handle in scope.
  Workaround under test: call the child `MBMap.getOr` directly inside the
  mutator body instead of routing through the public helper.

- Also in the `AssetTotals` untrusted pass, the constructor
  `public func empty() : AssetTotals ensures model(result) == Map.empty...`
  fails to prove the postcondition because the generated check cannot recover
  permission for the nested `MBMap.MapMem` inside the returned opaque record.
  This is the same nested-opaque constructor folding/projection gap previously
  seen with `AssetTotals.empty` and `UserBalances.empty`. Current workaround
  under test: temporarily remove the constructor model postcondition while
  focusing on mutator deltas.

- A ghost-snapshot workaround for `AssetTotals` also exposed a self-framing
  failure in opaque invariants over nested `MBMap` handles. Shape:
  `AssetTotals = opaque { totals : MBMap.MapMem<Text,Nat>; ghost var snapshot :
  Map<Text,Nat>; invariant MBMap.orderedBy(totals, Text.compare); invariant
  snapshot == MBMap.model(totals) }`. Verification of
  `playground/invar/dex2/lib/AssetTotals.sr9` fails while checking the generated
  opaque predicate: the precondition of `$spec$MBMap$orderedBy$Text$Nat` might
  not hold because `Owned$Opaque$MapMem(...)` for the child field is not in
  scope. This suggests nested opaque child projection is not being made
  available while self-framing invariant calls that mention multiple child
  observer facts. Repro command is the same single-file verify command above.

- Strengthening `LedgerAccounting.net` with the exact clamped-subtraction
  formula verified in the leaf module but broke the full DEX gate through
  imports. Shape:
  `ensures result == (if (outflow(accounting, key) >= inflow(accounting, key))
  0 else inflow(accounting, key) - outflow(accounting, key))`. Direct command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores
  4 --verify playground/invar/dex2/lib/LedgerAccounting.sr9` passed. Full gate:
  `JOBS=4 XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1
  ./scripts/run-op6-dex2-gate.sh` failed in `InvariantObservers.sr9` with
  imported contract well-formedness errors around insufficient permission to
  access the nested `LedgerAccounting` owner through `Dex.State`, plus
  downstream `Dex.ledgerNet` preservation failures. This is a bad ergonomics
  cliff: a locally valid pure observer summary becomes unusable when imported
  through a parent opaque owner.

- Trying to make `AssetTotals.list` prove each returned payload matches the map
  model failed even after OP7 listing improvements. Shape: add an `entryMatches`
  ghost observer and a `forall i < Array.size(result)` postcondition over
  entries produced by `BMap.entries`. Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores
  4 --verify playground/invar/dex2/lib/AssetTotals.sr9`. Failure:
  postcondition of `AssetTotals$list` might not hold; the iterator path does
  not retain enough exact model facts for the returned key/value payloads.
  Workaround remains owner-maintained key logs plus authoritative re-reads in
  modules that need list contracts.

- Switching `AssetTotals` from `MBMap` to pure `BMap` avoids the nested child
  projection failures but exposes an owner-transaction refold problem on mutable
  opaque fields. Shape: `AssetTotals = opaque { var totals :
  BMap.BMap<Text,Nat>; invariant BMap.orderedBy(totals, Text.compare) }`, with
  `credit`/`debit` assigning `totals.totals := BMap.add(...)`. Verification
  fails at method exit: folding `Owned$Opaque$AssetTotals(...)` might fail
  because there may be insufficient permission to access the mutable field
  `$h...$totals`. This happens with and without explicit `modifies totals`.
  Repro command: single-file verify for `AssetTotals.sr9`.

- Working untrusted leaf pattern found for `AssetTotals`: use a pure `BMap`
  field, remove the opaque invariant, expose `public pure func ordered(...)`,
  and make runtime readers/mutators require and preserve `ordered(...)`.
  Important detail: `credit`/`debit` must assert both `ordered(totals)` and the
  unfolded `BMap.orderedBy(totals.totals, Text.compare)` immediately before
  `BMap.add`; otherwise the precondition for `BMap.add` is not recovered after
  the `get` helper call. With that shape,
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/AssetTotals.sr9`
  succeeds without any `trusted func` in `AssetTotals`.

- Retried strengthening `Dex.beginWithdraw` with the exact conservation surface
  we want for a successful pre-await withdrawal:
  local ledger total and local obligation decrease by `debitAmount`,
  pending-out increases by `debitAmount`, and ledger net is unchanged. Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/Dex.sr9`.
  Failure remained at the method postcondition after `BalanceBook.debit` and
  `PendingWithdrawals.begin`. An assertion-instrumented retry also showed a
  smaller ergonomics issue: after reading
  `let totalBefore = Dex.localLedgerBalanceTotal(dex, ledger)`, the verifier
  could not prove the same read was equal to `totalBefore` in an immediately
  following no-mutation branch. This is another parent/child opaque summary
  retention problem, so the concrete transition contract was reverted to the
  verified caller-balance fact and the conservation equation is represented for
  now by arithmetic observer kernels.

- Parent opaque records with multiple child opaque handles still have refold
  trouble when one child is mutated and another is only needed for the parent
  invariant. Shape: `LedgerAccounting = opaque { inflow :
  AssetTotals.AssetTotals; outflow : AssetTotals.AssetTotals; invariant
  AssetTotals.ordered(inflow); invariant AssetTotals.ordered(outflow) }`, with
  `recordDeposit` only calling `AssetTotals.credit(accounting.inflow, ...)`.
  Verification fails at parent fold because permission for the untouched
  `outflow` child is not available. The symmetric failure occurs when mutating
  `outflow` and needing `inflow`. Adding `modifies accounting` did not change
  the result. Workaround under test: remove those parent invariants and expose
  an explicit `ordered(accounting)` observer/precondition instead.

- The explicit-observer workaround for the same `LedgerAccounting` shape is
  not enough when the method postcondition re-states `ordered(accounting)`.
  Shape: `LedgerAccounting = opaque { inflow : AssetTotals.AssetTotals;
  outflow : AssetTotals.AssetTotals }`, with
  `recordDeposit` requiring/ensuring `ordered(accounting)` and mutating only
  `accounting.inflow`. Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/LedgerAccounting.sr9`.
  Failure: the generated postcondition for `LedgerAccounting$recordDeposit`
  cannot access `Owned$Opaque$AssetTotals(...)` for the mutated child when
  proving `ordered(accounting)`; `recordWithdraw` and `recordForcedReturn` fail
  symmetrically for `outflow`. This means a parent opaque record containing
  multiple child opaque handles cannot currently expose a useful post-state
  observer over those children without either trusting the parent transition or
  changing the representation. Next workaround to try: keep the public
  accounting API but store the inflow/outflow maps directly in the parent
  module instead of composing through child `AssetTotals` handles.

- The direct-map `LedgerAccounting` rewrite exposed a small lowering bug:
  inside a public opaque mutator, `let current = switch (BMap.get(...)) { ... }`
  failed during Viper translation with `break in expression context` at the
  option case arm. Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/LedgerAccounting.sr9`.
  Workaround: move the same switch expression into a private pure helper
  `mapGet(map, key)` and call that helper from the mutator.

- The same `break in expression context` lowering issue also appears for a
  tuple-valued switch in `PoolRegistry.createPool`: `let (a, b) = switch
  (Principal.compare(...)) { case (#less) { (ledgerA, ledgerB) }; ... }`.
  Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PoolRegistry.sr9`.
  Workaround: branch on `Principal.compare` as a statement and perform the
  small pool insertion body inside each non-equal branch.

- Working untrusted pattern for `LedgerAccounting`: avoid nested
  `AssetTotals` children and store `var inflows : BMap.BMap<Text, Nat>` plus
  `var outflows : BMap.BMap<Text, Nat>` directly in the owner module. Expose
  `ordered(accounting)` over both maps, use a trivial public ghost
  `model(accounting)` only to satisfy the opaque owner model-surface policy,
  and keep exact useful models in `inflowModel`/`outflowModel`. With that
  shape, the command above verifies without any `trusted func` in
  `LedgerAccounting`.

- `LedgerSet` also verifies without trusted code after using the direct-map
  owner pattern. Status and cached-fee slots are not additive totals, so the
  module now overwrites `BMap` entries directly (`1` active, `2` retiring,
  `0` absent) instead of composing through `AssetTotals.credit/debit`.
  Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/LedgerSet.sr9`.

- `PendingWithdrawals` and `PendingReturns` originally verified without trusted
  code with the direct-map owner pattern while the per-user keys were `Text`.
  After switching those per-user keys to `(Principal, Text)`, the read-only
  accessors still verify untrusted, but `empty`, `begin`, and `take` are kept
  trusted because tuple-key `BMap.orderedBy` invariants do not open/fold
  reliably in those mutators yet. `take` clears the per-user pending slots and
  updates per-ledger totals with saturating subtraction, which keeps the runtime
  robust even if a future bug corrupts the summary total. Commands:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PendingWithdrawals.sr9`
  and
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PendingReturns.sr9`.

- `BalanceBook` is compiling/verifying again after the `UserBalances.debit`
  API change, but it still uses trusted boundaries for the hard operations over
  `BMap<Principal, UserBalances.UserBalances>`. This remains the main nested
  opaque-handle layer to tackle if we want a fully untrusted DEX proof.
  Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/BalanceBook.sr9`.

- `Pool.sr9` now verifies without any `trusted` functions. Proving the mutators
  found two real guard gaps: `applySwap` must reject `amountOut >= outputReserve`
  so a live pool cannot keep shares while one reserve becomes zero, and
  `applyRemove` must require an all-share removal to return exactly all
  reserves. Otherwise the pool invariant `totalShares == 0 ==> reserves == 0`
  or `totalShares > 0 ==> reserves > 0` could be violated by an arbitrary plan.
  Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/Pool.sr9`.

- Most `PoolRegistry` routes now verify without trusted code:
  `reserveTotal`, `getInfo`, `getInfoByKey`, `createPool`, `quote`,
  `planSwap`, `applySwap`, `planAdd`, `applyAdd`, `planRemove`,
  `applyRemove`, `deletePool`, `totalShareSupply`, and `lockedShareSupply`.
  For `createPool`, the verifier needed result-surface postconditions on
  `Pool.new`/`Pool.info` for the key and distinct ledger fields. It also lost
  BMap facts when a key-log scan happened after insertion, so the verified
  shape scans the log before inserting and then appends based on the saved
  boolean. The apply/delete mutators needed defensive guards that the stored
  pool key/ledgers match the plan/info and that local ledger asset keys are
  distinct before reserve mutations. Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PoolRegistry.sr9`.

- Historical, superseded for `containsLedger`: `PoolRegistry.containsLedger`
  and `PoolRegistry.list` were both trusted read-only boundaries when they
  scanned `poolKeys`. The scan bodies computed the right runtime result, but
  the verifier could not prove `model(registry) == old(model(registry))`
  through the BSeq scan. `containsLedger` later stopped scanning and now
  verifies through a ledger-pool count index; `PoolRegistry.list` still has the
  scan/frame issue. Repro for the old scan shape:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PoolRegistry.sr9`.

- Full `Dex.sr9` composition exposed an import/export bug around public
  `ordered(...)` observers. The direct-map modules (`LedgerAccounting`,
  `LedgerSet`, `PendingReturns`, and `PendingWithdrawals`) each verified alone
  with public postconditions like `ensures result ==
  BMap.orderedBy<Text, Nat>(field, Text.compare)`, but importing them through
  `Dex.sr9` produced 152 errors of `abstract predicates cannot be unfolded` at
  those observer postconditions. Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --cores 1 --verify-timeout-ms 1500000 --verify playground/invar/dex2/lib/Dex.sr9`.
  Planned workaround: keep BMap ordered facts inside opaque invariants/private
  helpers and stop exporting `BMap.orderedBy(...)` through public observer
  contracts.

- The working workaround for the imported `ordered(...)` problem is to put
  `BMap.orderedBy(...)` directly in the opaque record invariants and avoid
  public/private helper contracts that expose that abstract predicate. After
  moving the ordered facts into opaque invariants for `LedgerAccounting`,
  `LedgerSet`, `PendingWithdrawals`, and `PendingReturns`, both concrete
  `Dex.sr9` and `DexActorDemo.sr9` verified again with the long top-level
  commands. This still leaves several public methods trusted, but it avoids the
  abstract-predicate import failure while preserving map ordering as a real
  owner invariant.

- Tuple keys work for the pending user/ledger maps only while the mutators stay
  trusted. `PendingWithdrawals` and `PendingReturns` verified as leaf modules
  with `(Principal, Text)` keys when `empty/begin/take` were trusted, but trying
  to prove those mutators exposed a tuple-key ordered-invariant fold gap. The
  verified workaround is to use a `Text` record key built as
  `Principal.toText(user) # ":" # ledgerKey`, with `Text.compare` for all
  pending BMaps. Principal text does not contain `:`, and ledger keys are under
  our `ledger:` namespace, so this keeps the runtime key space separated while
  letting the verifier use the already-working text-key BMap path.

- Moving `AssetTotals`/`UserBalances` ordered facts into opaque invariants
  exposed another instance of the same-owner opaque self-call problem. Calling
  the public `get(owner, key)` from `credit`/`debit` on the same opaque owner
  made owner refolding fail with "insufficient permission to access
  $h.MutRec...". Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 4 --verify playground/invar/dex2/lib/AssetTotals.sr9`.
  Workaround: use a private pure `mapGet` helper over the raw BMap field inside
  the owner method, avoiding a public self-call while the owner is open.

- Trying to make `PendingWithdrawals.begin/take` fully untrusted with tuple-key
  maps exposed a tuple-key ordered-invariant gap. The opaque record has
  invariants like `BMap.orderedBy<(Principal, Text), Nat>(amounts,
  compareRecordKey)`, but inside the public mutator the verifier could not
  prove a direct `assert BMap.orderedBy<RecordKey, Nat>(pending.amounts,
  compareRecordKey)`. `empty` also failed to fold the owner after
  `BMap.orderedBy_empty<RecordKey, Nat>(compareRecordKey)`. Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 4 --verify playground/invar/dex2/lib/PendingWithdrawals.sr9`.
  Current workaround: keep the tuple-key pending mutators trusted, but leave the
  read-only pending accessors untrusted.

- Final state for this pass: `AssetTotals`, `UserBalances`,
  `LedgerAccounting`, `LedgerSet`, `InFlightDeposits`, and `Pool` verify without
  trusted functions. `LedgerSet.add/retire/rem` became untrusted after adding
  helper/result contracts that expose successful key presence in the model.
  `AssetTotals` and `UserBalances` no longer export public `ordered(...)`
  helpers; orderedness is an opaque invariant. The full gates pass with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --cores 4 --verify-timeout-ms 1500000 --verify playground/invar/dex2/lib/Dex.sr9`
  and
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --cores 4 --verify-timeout-ms 1500000 --verify playground/invar/dex2/DexActorDemo.sr9`.

- Making `AssetTotals.get`/`UserBalances.get` pure verifies and lets
  `PoolRegistry.reserveTotal` verify without trust. Trying the same for
  `BalanceBook.get` and `BalanceBook.total` hit the existing result-dependent
  postcondition lowering bug through trusted `BalanceBook.debit`: generated VPR
  put `result ==> ...` into a method precondition and failed with "`result` can
  only be used in function postconditions". Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 4 --verify playground/invar/dex2/lib/BalanceBook.sr9`.
  Current workaround: keep the `BalanceBook` public getters trusted while the
  trusted mutators still have result-dependent contracts.

- `AssetTotals.credit/debit` and `UserBalances.credit/debit` now export
  per-key frame contracts:
  `forall<Text>(pure func (other) = other != key ==> value(other) == old(value(other)))`.
  This was necessary for untrusted two-ledger pool reserve updates: after
  crediting/debiting one ledger key, the verifier otherwise could not prove the
  other ledger reserve was unchanged. The quantifier callback must be marked
  `pure`; otherwise translation fails with "uncontracted callback expects a
  pure or trusted function value".

- `Pool.applyAdd`, `Pool.applySwap`, `Pool.applyRemove`, `Pool.quoteExactIn`,
  and `PoolRegistry.quote` now export the receipt/result fields needed by
  downstream callers. Missing result-surface facts showed up as top-level
  `Dex.quote`/`Dex.swap` postcondition failures even though the runtime bodies
  returned the right fields.

- `PoolRegistry.list` remains trusted because its BSeq scan is an effectful
  loop and the verifier still cannot prove `model(registry) ==
  old(model(registry))` through the scan. `PoolRegistry.containsLedger` used to
  have the same scan problem, but it now verifies without `trusted` by using a
  module-owned `Text -> Nat` ledger-pool count index maintained on pool
  create/delete.

- Top-level `Dex` reductions that verify: pure observers (`controller`,
  `localBalance`, `ledgerNet`, `localObligation`, `pendingOut`,
  `accountingBalanced`, `lpSupplyBalanced`), private transfer-fee refresh
  helpers, `controllerAddLedgerPrecheck`, `controllerAddLedger`,
  `controllerRetireLedger`, `controllerRemoveLedger`, `quote`, and the internal
  `deposit` bookkeeping helper. `controllerRemoveLedger` started verifying
  after `PoolRegistry.containsLedger` stopped scanning and became an indexed
  pure lookup. `beginDeposit`, `finishDepositOk`, `finishDepositErr`, and
  `finishDepositReject` now verify after flattening `InFlightDeposits` and
  adding controller-frame postconditions to the private fee-refresh helpers.
  `finishWithdrawOk`, `finishWithdrawErr`, and `finishWithdrawReject` also
  verify after the same fee-refresh frame improvement and a success-path cleanup
  that uses the `started` withdrawal receipt as the authoritative post-await
  value. `finishReturnOk`, `finishReturnErr`, and `finishReturnReject` verify
  with the same pattern for controller forced returns. `swap` now verifies after
  strengthening the pool and registry swap summaries to carry the quoted
  `minAmountOut` through the plan and receipt surfaces. `liquidity` now
  verifies after surfacing positive-share facts from pool add-liquidity plans.

- Current full gates pass with one core:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --cores 1 --verify-timeout-ms 1800000 --verify playground/invar/dex2/lib/Dex.sr9`
  and
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --cores 1 --verify-timeout-ms 1800000 --verify playground/invar/dex2/DexActorDemo.sr9`.

- `AmmMath.sqrtFloor` now verifies without `trusted` using a binary-search
  implementation with loop invariants:
  `low * low <= n` and `n < (high + 1) * (high + 1)`. This removes the last
  trusted function from `AmmMath` and keeps `Pool.sr9` verifying.

- `Dex.empty`, `Dex.balances`, `Dex.pools`, `Dex.createPool`,
  `Dex.beginWithdraw`, and `Dex.beginReturnLedgerBalances` now verify without
  `trusted`. `beginWithdraw` needs to keep the defensive
  `let debited = BalanceBook.debit(...)` check, even after a preceding balance
  guard, because the trusted `BalanceBook.debit` contract is the fact that gives
  the verifier the local-balance decrement.

- The pending modules now verify with no trusted functions after switching their
  per-user record key from `(Principal, Text)` to `Text`. Commands:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PendingWithdrawals.sr9`
  and
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PendingReturns.sr9`.
  The concrete DEX and actor gates also passed afterwards with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --cores 1 --verify-timeout-ms 1800000 --verify playground/invar/dex2/lib/Dex.sr9`
  and
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --cores 1 --verify-timeout-ms 1800000 --verify playground/invar/dex2/DexActorDemo.sr9`.

- Retried `BalanceBook.get`/`BalanceBook.total` as untrusted pure functions.
  Even after changing `BalanceBook.debit` from implication postconditions to a
  single conditional postcondition, the translator still generated illegal VPR
  method preconditions containing `result`, with "`result` can only be used in
  function postconditions". Removing the Bool result from `debit` avoided that
  frontend bug at the leaf level, but made the full `Dex.sr9` proof run for
  over 9 minutes on one core and over 3 minutes on four cores without producing
  a result. That experiment was reverted to keep the stable gate fast enough.

- While testing a non-Bool `BalanceBook.debit`, the leaf proof exposed the real
  aggregate invariant we are missing inside `BalanceBook`: the verifier cannot
  derive that `AssetTotals.value(key) >= amount` from
  `UserBalances.get(user, key) >= amount`. Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/BalanceBook.sr9`.
  The failing call was `AssetTotals.debit(book.totals, key, amount)` inside
  `BalanceBook.debit`. A real fix probably needs a BalanceBook-level invariant
  or cached per-key proof surface saying totals dominate each user's balance.

- Retried `Dex.finishWithdrawErr` without `trusted` after pending `take` became
  untrusted. The proof did not finish after about 5.5 minutes on the one-core
  Dex gate and was reverted. This looks like a top-level search explosion around
  pending removal plus `BalanceBook.credit`/fee refresh framing, not a leaf
  pending-map problem.

- Added a `ledgerPoolCounts : BMap<Text, Nat>` index to `PoolRegistry` so
  ledger membership is not inferred by scanning `poolKeys`. The first attempt
  used a second `AssetTotals.AssetTotals` child for this index, but deleting a
  pool exposed opaque-child alias/framing ambiguity: after reserve debits, the
  verifier could no longer prove the count-child `AssetTotals.debit`
  precondition. Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PoolRegistry.sr9`.
  The verified workaround is to keep the count map as a raw BMap field owned by
  `PoolRegistry` with its own ordered invariant.

- Retried `PoolRegistry.list` without `trusted` after the registry shape change.
  It still fails to prove the read-only `model(registry) ==
  old(model(registry))` postcondition through the BSeq scan, so `list` remains
  the only trusted function in `PoolRegistry`.

- Retried a stronger exported postcondition on untrusted
  `PoolRegistry.containsLedger`:
  `result == (countGet(registry.ledgerPoolCounts, AssetKey.ledger(ledger)) > 0)`.
  The registry leaf verified, but importing through `Dex.sr9` failed with
  "abstract predicates cannot be unfolded" at that postcondition because it
  exposes the private raw-BMap helper over an opaque field. Current workaround:
  keep the implementation untrusted but leave its exported postcondition as
  `ensures true`.

- `BalanceBook.balances` now verifies without `trusted` while preserving its
  exported read-only `userModel(book) == old(userModel(book))` frame. The
  BalanceBook leaf, concrete DEX, and actor gates all pass after this change.

- Retried `BalanceBook.holders` without `trusted`. With the read-only frame
  postcondition it failed to prove `userModel(book) == old(userModel(book))`
  through the holder-log scan. Weakening it to `ensures true` was rejected by
  the opaque handle policy as a vacuous payload effect contract. It remains
  trusted.

- Retried `BalanceBook.firstNonControllerHolder` without `trusted` after
  `holders` was restored as a trusted frame boundary. It failed inside the loop
  with insufficient permission to call `BalanceBook.get(book, user, key)` on
  each holder. It remains trusted.

- Retried `BalanceBook.empty` without `trusted`. It still fails the nested
  opaque construction postcondition with insufficient permission to access the
  returned `BalanceBook` owner through `userModel(result)`. It remains trusted.

- `InFlightDeposits` originally reused `AssetTotals`, which was verified as a
  child opaque module in isolation but made the top-level `Dex.beginDeposit`
  proof time out. Flattening it into a module-owned raw
  `BMap<Text, Nat>` with an opaque `BMap.orderedBy` invariant gives the DEX
  verifier direct ownership of the pending-count map. `InFlightDeposits.begin`
  and `end` now prove exact count deltas without any trusted functions.

- The first untrusted `Dex.finishDepositErr` retry after the
  `InFlightDeposits` rewrite failed only on the owner frame:
  `controllerOf(dex) == old(controllerOf(dex))` after
  `refreshTransferFromFee`. The helper had `ensures true`, so callers lost the
  fact that only the ledger fee cache can change. Adding
  `ensures controllerOf(dex) == old(controllerOf(dex))` to both private fee
  refresh helpers made `finishDepositErr` and `finishDepositReject` verify.

- `Dex.finishWithdrawErr` and `Dex.finishWithdrawReject` now verify with the
  untrusted pending `take`, trusted `BalanceBook.credit`, and framed
  `refreshTransferFee`. `Dex.finishWithdrawOk` initially failed because the
  trusted contract assumed the pending record matched the `started` argument,
  but `PendingWithdrawals.take` does not export that relation. The verified
  implementation now records and returns the `started.debitAmount`/fields after
  proving `started.debitAmount == started.amount + started.fee`; the actor
  proves that precondition from `beginWithdraw` before and after the await.

- `Dex.finishReturnErr` and `Dex.finishReturnReject` now verify through
  `PendingReturns.take`, `BalanceBook.credit`, and the framed fee refresh.
  `Dex.finishReturnOk` had the same pending-record-vs-started-record issue as
  `finishWithdrawOk`, so it now requires
  `started.returnedAmount + started.fee == started.localBalance` and uses the
  `started` fields for accounting and the returned receipt. The actor proves
  that equation before the ledger await and again at the success call site.

- `Dex.swap` now verifies without `trusted`. The first untrusted retry failed
  because `PoolRegistry.planSwap` did not export
  `plan.minAmountOut == minAmountOut`, and `PoolRegistry.applySwap` did not
  export `receipt.minAmountOut == plan.minAmountOut`; the pool layer already
  constructed those values but did not expose the first fact either. Adding
  those result-surface facts to `Pool.planSwap`, `PoolRegistry.planSwap`, and
  `PoolRegistry.applySwap` made the Pool, PoolRegistry, DEX, and actor gates
  pass.

- `Dex.liquidity` now verifies without `trusted`. The first untrusted retry
  failed on the public postcondition that successful add/remove receipts have
  positive `shares`; the add path did not export `plan.shares > 0` through
  `Pool.planAdd` or `PoolRegistry.planAdd`, even though the AMM math helpers
  already guaranteed it. Adding that result-surface fact made Pool,
  PoolRegistry, DEX, and actor verification pass.

- Retried `Dex.removePool` without `trusted`. The holder-settlement loop itself
  did not surface an arithmetic failure; verification failed only after
  `PoolRegistry.deletePool(dex.pools, ...)`, where the DEX proof could no
  longer prove `dex.controller == controllerBefore`. A full-model delete
  postcondition, an explicit `modifies registry`, and a smaller
  `PoolRegistry.poolCount` delete summary all verify at the registry leaf but
  still do not give the imported DEX proof enough owner-frame information.
  Current workaround: keep `Dex.removePool` trusted.

- Retried `PoolRegistry.list` without `trusted`. `BMap.entries` over
  `Pool.Pool` values is rejected by the opaque-handle higher-order escape
  policy. The older `poolKeys` scan shape verifies through the loop only with
  trusted framing; even replacing `Pool.info(pool)` with pure `Pool.model(pool)`
  and weakening the frame to `poolCount(registry) == old(poolCount(registry))`
  still fails after the local `BSeq.toArray` conversion. `list` remains trusted.

- `BalanceBook.total` now verifies without `trusted` as an exact wrapper around
  `AssetTotals.value(book.totals, key)`. The BalanceBook leaf, concrete DEX, and
  actor gates pass after this change.

- Retried more BalanceBook cuts. `BalanceBook.empty` still fails on insufficient
  permission to access the returned opaque owner, even with a direct
  `BMap.size(result.users) == 0` postcondition. `BalanceBook.get` still hits
  the existing generated-VPR bug where `result` appears in method
  preconditions through the trusted `debit` contract. `BalanceBook.credit`
  cannot prove its old-state total delta through the nested `AssetTotals` field,
  and `BalanceBook.holders` cannot preserve even the lighter
  `userCount(book) == old(userCount(book))` frame through its scan/toArray path.

- Current trusted count after the `BalanceBook.total` reduction is 8:
  1 in `Dex.sr9`, 6 in `BalanceBook.sr9`, and 1 in `PoolRegistry.sr9`.

- Profiling run on 2026-05-16:
  - Command shape:
    `S9_VIPER_TIMING=1 XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --viper playground/invar/dex2/lib/Dex.sr9`
    emitted a 28,011-line VPR program to stdout and timing diagnostics to
    stderr.
  - Main finding: generated-VPR verification is not the dominant cost. Raw
    Silicon over the emitted VPR succeeded in 32.597s wall time
    (`real 32.597 user 68.955 sys 3.797`) with
    `--numberOfParallelVerifiers 1`.
  - Translation/lowering is the expensive part. `pipeline.translate.opaque_libs`
    took 97.863s before the main DEX unit, while `pipeline.translate.main.Dex.sr9`
    took 13.953s and `pipeline.pretty_prog_mapped` took 0.084s.
  - The repeated expensive lowering blocks are declaration-only contract
    generation for imported generic helpers:
    `lower.module.build_decl_only_probe` and
    `lower.module.local_decl_only_pure_fns` repeatedly take about 5.2-5.4s
    each, with `lower.decl_only.contracts` handling roughly 696-873 contracts
    per imported opaque unit. This looks like a compiler/verifier ergonomics
    issue: the same imported contract surfaces are rebuilt many times across
    opaque dependencies.
  - Method-isolated raw Silicon runs with `--includeMethods Dex$...` all
    verified. The timings were dominated by JVM/Silicon parse/setup overhead:
    trivial DEX methods took about 20.6-21.2s, while the slowest isolated method
    was `Dex$liquidity` at 22.456s. `Dex$beginWithdraw` verified in isolation at
    21.536s and `Dex$swap` at 20.915s.
  - Raw Silicon emitted many `Unconstrained type parameter, substituting default
    type Int` warnings around generated VPR lines 26875-27992. These warnings do
    not block verification, but they may be worth investigating because they
    cluster near generated wrapper/spec code.

- Follow-up performance inspection:
  - The current slow path is VPR generation, not VPR verification. For the same
    DEX file, the timed emit path spent about 350s before producing VPR:
    `pipeline.translate.transitive_libs` 135.970s,
    `pipeline.translate.direct_decl_only_libs` 102.258s,
    `pipeline.translate.opaque_libs` 97.863s, and
    `pipeline.translate.main.Dex.sr9` 13.953s. Raw Silicon over the final VPR
    still took only 32.597s.
  - The repeated hot operation is declaration-only pure/spec contract emission.
    Across the timing log there were 66 `lower.decl_only.contracts` blocks,
    covering 46,872 translated contract surfaces and summing to 315.338s inside
    those blocks. This sum overlaps with parent stage timings, but it identifies
    the actual local operation: `preposts_from_spec_meta_pure` inside
    `build_spec_decl_only_pure_items` in `src/viper/lower.ml`.
  - The cache for those declaration-only items is per translated unit:
    `create_decl_only_items_cache ()` is called inside module lowering before
    `lower.module.build_decl_only_probe` (`src/viper/lower.ml` around
    17658-17669). That cache catches repeated calls within one unit
    (`decl_only_pure_fns` and `decl_only_pure_fns_late` often show `cache-hit`),
    but it cannot reuse the same 300+ imported declarations across
    transitive/direct/opaque/main unit translations.
  - There is a likely local-scope bug/ergonomics issue in
    `build_spec_decl_only_pure_items`: it accepts a `spec_meta` argument, emits
    `first` from that argument, but the late-specialization loop calls
    `specialized_spec_meta ctxt' |> emit` directly (`src/viper/lower.ml` around
    14607-14616). That widens a local-only request back to the full global spec
    metadata set. In the timing log, 21 `lower.decl_only.items` blocks had
    `first_items=0` but still produced more than 300 items. These are mostly
    `local_decl_only_pure_fns` calls where the initial local metadata is empty,
    but the late pass rebuilds the imported global set anyway.
  - The pipeline also translates many direct imports twice. Direct imports such
    as `BalanceBook`, `LedgerSet`, `PendingReturns`, `PendingWithdrawals`, and
    `PoolRegistry` are first translated in `direct_decl_only_libs` with
    `~assume_decl_only:true` (`src/pipeline/pipeline.ml` around 4842-4861), then
    translated again in `opaque_libs` without `~assume_decl_only`
    (`src/pipeline/pipeline.ml` around 4974-4990). The opaque pass returns
    `(mvir_prog, vpr_prog)`, but the VPR part is not merged into the final VPR;
    only the MVIR side is used for external effects/fresh/trap registration
    around 4992-5014. Fusing these paths for direct opaque libs could remove
    roughly one 98s pass in this DEX case.
  - Suggested fix order:
    1. Fix `build_spec_decl_only_pure_items` so late specialization is scoped to
       the supplied `spec_meta`, or add a mode that disables global late emission
       for singleton local metadata. This should remove the `first_items=0` but
       `items>300` blocks and cut a large part of the repeated local-decl work.
    2. Avoid translating direct opaque libs twice. Translate direct opaque libs
       once, reuse their MVIR for opaque registration, and reuse a body-stripped
       VPR/declaration view for the direct import surface. `strip_viper_method_bodies`
       already exists in `src/viper/lower.ml`; it may need to be exposed through
       `Viper.Trans` or moved to a small shared utility.
    3. Consider a session-scoped decl-only item cache after the scoping bug is
       fixed. This is promising but needs care: cached Viper items may skip
       side effects from `tr_typ`, mutable-record/sequence registrations, and
       specialization discovery. A safe version probably needs to either replay
       those side effects or cache a lower-level contract translation artifact
       instead of final Viper items.
    4. Longer term, split the opaque registration path from full Viper item
       generation. The opaque pass currently needs MVIR summaries, not a final
       VPR program, but `unit_with_mvir` pays for all module lowering and VPR
       item construction.

- Minimal performance repros added under
  `playground/invar/repro/perf_declonly/`:
  - `local_pure_no_core.mo` is the baseline. It has one local pure function and
    no generic core imports. Command:
    `S9_VIPER_TIMING=1 XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --hide-warnings --viper playground/invar/repro/perf_declonly/local_pure_no_core.mo`.
    Result: no decl-only contract blocks, no widened local decl-only emission,
    and `pipeline.translate.main.local_pure_no_core.mo` took 0.001s.
  - `local_pure_bmap_late_global.mo` is the small repro for the local metadata
    widening bug. It imports `BMap`, defines local pure functions with bodies,
    and should not have local decl-only functions to emit. Result:
    18 `lower.decl_only.contracts` blocks, 4,692 contract surfaces, 3.012s
    inside decl-only contract emission, and one main-unit
    `local_decl_only_pure_fns` block with `items=124 first_items=0`. This is
    the tiny version of the DEX `first_items=0` but `items>300` pattern.
  - `OpaqueBook.mo` plus `opaque_double_import.mo` is the small repro for
    direct opaque imports being translated twice. Result:
    `pipeline.translate.direct.OpaqueBook.mo` took 0.485s and
    `pipeline.translate.opaque.OpaqueBook.mo` took another 0.485s. The file also
    shows two widened local decl-only blocks (`widened_first0=2`) and 5,574
    translated decl-only contract surfaces.
  - Summary command used for the repro logs:
    `awk '/ lower\\.decl_only\\.contracts / { ... } / lower\\.decl_only\\.items / { ... }'`
    over `/tmp/sector9-perf-repro/{no_core,bmap_local,opaque_double}.err`.
    The important stable indicators are the named timing labels and
    `first_items=0` with nonzero `items`; wall-clock numbers will vary by
    machine.

- OP5 follow-up DEX2 actor gate on 2026-05-17:
  `XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/DexActorDemo.sr9`.
  Result: verification succeeded. Largest recorded stages were
  `verify.pipeline_viper_files` 114.554s, `verify.silicon_wait` 19.854s,
  `pipeline.translate.opaque_libs` 10.839s, `pipeline.translate.transitive.BMap.sr9`
  9.519s, `pipeline.translate.opaque.Dex.sr9` 5.209s, and
  `pipeline.translate.main.DexActorDemo.sr9` 2.192s. The timed stages sum to
  roughly 135s after preflight, plus 3.577s runtime preflight.

- Removed the two unused DEX2 helper modules:
  `playground/invar/dex2/lib/UserBalances.sr9` and
  `playground/invar/dex2/lib/LedgerOps.sr9`. The active code path uses the flat
  `BalanceBook` module and actor-owned ICRC awaits. `spec.md` now describes
  this current shape instead of the older nested-map/async-helper plan.

- Strengthened and verified narrow proof surfaces:
  `AssetKey.sr9` now exports exact ledger/pool key and canonical endpoint facts;
  `LedgerAccounting.inflow/outflow` now expose their ghost snapshot values;
  `PendingWithdrawals` and `PendingReturns` now expose exact `recordKey`,
  `empty`, and `total` facts, and `PendingWithdrawals.has` exposes its exact
  debit-presence fact. Leaf gates for those modules passed, and the concrete
  `Dex.sr9` and actor gates passed afterward.

- Retried `PoolRegistry.list` without `trusted` on 2026-05-17. The full
  read-only frame `model(registry) == old(model(registry))` still fails through
  the `poolKeys` scan. Removing the frame is rejected by the opaque handle
  policy because public opaque-handle mutators need a model/effect-relevant
  postcondition; using `poolCount(registry) == old(poolCount(registry))` also
  fails, and a direct field frame such as `registry.nextId == old(registry.nextId)`
  is treated as vacuous. `PoolRegistry.list` remains trusted.

- Retried the three `BalanceBook` listing cuts without `trusted`. Full
  `model`/`totalModel` frame postconditions still fail through the holder-log
  scan. Narrower postconditions such as `get(book, user, "") == old(...)` and
  `total(book, key) == old(...)` also fail, and `firstNonControllerHolder`
  loses permission to call the observer after `holders`. The three listing
  helpers remain trusted.

- Retried `Dex.removePool` without `trusted`. Verification failed on the
  controller frame after the pool deletion path, so this remains a top-level
  owner-frame proof cut. During that experiment, stronger imported pure
  postconditions on `PendingWithdrawals.get` and `PendingReturns.get` also
  reproduced the known bug where a pure observer postcondition over an opaque
  handle is emitted as a caller-side permission requirement. Those `get`
  postconditions were reverted to `ensures true`; the other pending observer
  strengthening stayed.

- Current DEX2 trusted count on 2026-05-17 is 5:
  `BalanceBook.balances`, `BalanceBook.holders`,
  `BalanceBook.firstNonControllerHolder`, `PoolRegistry.list`, and
  `Dex.removePool`. This supersedes the older note that counted 8 trusted
  functions after an earlier BalanceBook pass.

- Added exact top-level observer facts to `Dex.sr9`: `ledgerNet`,
  `localObligation`, `pendingOut`, and `lpSupplyBalanced` now expose their
  equations; successful `Dex.deposit`/`finishDepositOk` now prove the caller's
  local ledger balance increases by exactly `amount`. `Dex.sr9` and
  `DexActorDemo.sr9` both verified after these contract changes.

- Added proof observer files:
  `playground/invar/dex2/proofs/InvariantObservers.sr9` proves that `swap` and
  `liquidity` preserve real-ledger net accounting for the touched ledgers, and
  `playground/invar/dex2/proofs/LedgerRoundTripObservers.sr9` proves successful
  local deposit credit and pre-await withdrawal debit/refusal facts. Both files
  verified with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify <observer-file>`.

- Historical note, superseded later on 2026-05-17: failed
  withdraw/forced-return exact restoration and closed-loop no-profit observers
  originally needed a stronger pending-record relation and AMM/LP share
  summaries. The failed attempt to strengthen
  `PendingWithdrawals.get`/`PendingReturns.get` showed why the pending
  restoration proof should be solved with mutator result-surface facts or a
  verifier fix, not imported pure observer postconditions over opaque handles.
  The pending restoration part is now implemented; closed-loop no-profit
  observers remain open.

- 2026-05-17 update: the failed-withdraw and failed-forced-return restoration
  proofs are now implemented without using `get` observer postconditions.
  `PendingWithdrawals.take` and `PendingReturns.take` expose exact result
  surfaces for null and success cases, and `Dex.finishWithdrawErr`,
  `Dex.finishWithdrawReject`, `Dex.finishReturnErr`, and
  `Dex.finishReturnReject` now export client-facing postconditions through
  `Dex.pendingWithdrawalDebit` and `Dex.pendingReturnLocalBalance`.

- Important proof ergonomics note from this pass: adding intermediate body
  assertions such as
  `pendingBefore == old(PendingWithdrawals.pendingDebit(...))` inside
  `Dex.sr9` failed even though the final postcondition could be proved directly
  from `PendingWithdrawals.take` plus `BalanceBook.credit`. Reproduce by adding
  that assertion in either failed-withdraw branch and running:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/Dex.sr9`.
  The workaround is to avoid the extra old-state snapshot assertion and let the
  mutator postcondition discharge the exported postcondition directly.

- `LedgerRoundTripObservers.sr9` now proves:
  successful deposit credit, accepted pre-await withdraw debit, successful
  deposit plus completed withdraw leaves the local balance short exactly the
  cached withdrawal fee, failed withdraw error/reject restores the exact pending
  debit, and failed forced-return error/reject restores the exact pending local
  balance. The observer uses `mo:core/axiom/Nat` addition lemmas for the
  round-trip cancellation step; no new DEX2 `trusted` functions were added.

- Swap quote/apply consistency was tightened. `Pool.applySwap` now rejects a
  plan if the pool's current reserves do not match `plan.reserveInBefore` and
  `plan.reserveOutBefore`. Successful swap receipts now prove fee split
  equations and reserve equations:
  `reserveInAfter == reserveInBefore + effectiveAmountIn + lpFee` and
  `reserveOutAfter + amountOut == reserveOutBefore`. These facts are surfaced
  through `PoolRegistry`, `Dex.swap`, and `DexActorDemo.swap`. `quote` and actor
  quote responses also expose the fee split equations.

- Focused verification after this pass succeeded for:
  `playground/invar/dex2/lib/PendingWithdrawals.sr9`,
  `playground/invar/dex2/lib/PendingReturns.sr9`,
  `playground/invar/dex2/lib/AmmMath.sr9`,
  `playground/invar/dex2/lib/Pool.sr9`,
  `playground/invar/dex2/lib/PoolRegistry.sr9`,
  `playground/invar/dex2/lib/Dex.sr9`,
  `playground/invar/dex2/proofs/InvariantObservers.sr9`,
  `playground/invar/dex2/proofs/LedgerRoundTripObservers.sr9`, and
  `playground/invar/dex2/DexActorDemo.sr9` using:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify <file>`.
  `Types.sr9` also verifies directly, so no separate harness is needed.

- 2026-05-17 accounting-strengthening pass:
  `LedgerAccounting.sr9` now has an import-safe `settled(accounting, key)`
  observer and conditional exact net-delta postconditions on
  `recordDeposit`, `recordWithdraw`, and `recordForcedReturn`. The leaf module
  verifies with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/LedgerAccounting.sr9`.

- A stronger public `LedgerAccounting.net` contract was tried first:
  postconditions stated that `outflow >= inflow ==> net == 0` and
  `inflow >= outflow ==> net + outflow == inflow`. The leaf verified, but
  importing it through `Dex.ledgerNet` made the generated DEX VPR contract
  ill-formed with insufficient permission to access `Owned$Opaque$State(dex)`
  while checking the child `LedgerAccounting` observer. Repro:
  add those two postconditions to `LedgerAccounting.net`, then run
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/Dex.sr9`.
  Workaround: keep public `net` import-safe and put the stronger facts on the
  accounting mutators for now.

- `Dex.deposit` now exposes exact direct-ledger accounting facts:
  `localLedgerBalanceTotal` and `localObligation` both increase by the deposited
  amount, and `pendingOut` is unchanged. `InvariantObservers.sr9` has a
  `depositMovesLedgerAccountingExactly` observer over those facts. Verified:
  `playground/invar/dex2/lib/Dex.sr9`,
  `playground/invar/dex2/proofs/InvariantObservers.sr9`,
  `playground/invar/dex2/proofs/LedgerRoundTripObservers.sr9`, and
  `playground/invar/dex2/DexActorDemo.sr9` with the standard one-core command.

- Tried to give `Dex.beginWithdraw` the symmetric summary that successful
  pre-await withdrawal moves `started.debitAmount` from direct local ledger
  totals into `pendingOut`. The verifier kept the existing per-user balance
  debit fact, but could not prove either
  `localObligation(dex, ledger) + debitAmount == old(localObligation(...))` or
  the narrower
  `localLedgerBalanceTotal(dex, ledger) + debitAmount ==
  old(localLedgerBalanceTotal(...))` after the subsequent
  `PendingWithdrawals.begin` call. Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/Dex.sr9`.
  This looks like a parent opaque framing/summary-total retention limitation:
  per-user `BalanceBook.get` facts survive, but `BalanceBook.total` facts are
  lost through the later mutation of another child module. No trusted cut was
  added.

- 2026-05-17 deposit failure conservation pass:
  `Dex.beginDeposit`, `Dex.finishDepositErr`, and `Dex.finishDepositReject`
  now prove that direct-ledger local totals, local obligation, pending-out, and
  ledger net are unchanged. The fee-refresh helpers were also strengthened to
  frame those same local accounting observers when only the ledger fee cache is
  refreshed. `InvariantObservers.sr9` now has direct observer wrappers for the
  deposit precheck and both failed deposit completion branches. Verified:
  `playground/invar/dex2/lib/Dex.sr9`,
  `playground/invar/dex2/proofs/InvariantObservers.sr9`,
  `playground/invar/dex2/proofs/LedgerRoundTripObservers.sr9`, and
  `playground/invar/dex2/DexActorDemo.sr9`.

- Retried removing `trusted` from `BalanceBook.balances`. The full read-only
  frame `model(book) == old(model(book))` still failed. A weaker non-vacuous
  frame `userCount(book) == old(userCount(book))` also failed through the
  holder-log scan. Repro:
  remove `trusted` from `BalanceBook.balances`, weaken the frame as above if
  desired, and run
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/BalanceBook.sr9`.
  The trusted cut was restored; no new trusted functions were added.
  `spec.md` now documents that `balances`, `holders`, and `pools` are
  discovery/display snapshots: runtime scans may include duplicate log entries,
  but every emitted item is rechecked against the live map; proofs rely on
  `get`/`total` and transition postconditions rather than list ordering or
  uniqueness.

- Retried withdrawal failure conservation at the top level. Conditional
  postconditions on `Dex.finishWithdrawErr` and `Dex.finishWithdrawReject`
  stated that, when `started.balanceKey == AssetKey.ledger(started.ledger)` and
  an old pending debit exists, `localLedgerBalanceTotal` increases by the old
  pending debit and `pendingOut` decreases by the same amount. The concrete DEX
  proof failed both postconditions. This is the same summary-total retention
  limitation as the earlier `beginWithdraw` attempt: per-user local balance
  restoration proves, but aggregate `BalanceBook.total`/pending-total facts are
  lost across the parent transition. The attempted contract was reverted.

- 2026-05-17 LP-share balance proof pass:
  `BalanceBook.recordKey` is now public and exact, and
  `BalanceBook.credit`/`debit` prove a raw-record-key frame:
  every `model(book)` entry whose raw record key is not the touched
  `recordKey(user, key)` is preserved. This avoids needing unproved
  injectivity facts for `Principal.toText` or text concatenation while still
  giving callers a way to state disjoint balance slots precisely.

- `Pool.applyAdd`/`applyRemove` and the matching `PoolRegistry` methods now
  expose `receipt.poolKey == plan.poolKey`. This was necessary for the DEX
  liquidity layer to connect the planned virtual pool-ledger key with the
  returned receipt.

- `Dex.liquidity` now proves exact caller LP virtual-balance deltas under raw
  record-key distinctness conditions:
  successful add credits `receipt.shares` to `receipt.poolKey`, and successful
  remove debits `receipt.shares` from `receipt.poolKey`, provided that raw
  pool-share record key is distinct from the two real-ledger record keys touched
  by the operation. `InvariantObservers.liquidityMovesPoolSharesWhenSlotsDistinct`
  verifies this as an explicit proof wrapper. This is a client-facing LP-share
  movement proof, not yet the full global
  `totalShares == user pool balances + lockedShares` invariant.

- A similar successful-swap output-balance guarantee was tried on `Dex.swap`.
  `Dex.sr9` verified it, but importing that heavier conditional postcondition
  made `DexActorDemo.sr9` fail its existing swap receipt postcondition, and a
  separate `InvariantObservers` wrapper could not consume the imported
  conditional fact either. The attempted swap guarantee was removed to keep the
  actor gate green. This is another imported conditional postcondition
  ergonomics issue; the reusable BalanceBook raw-key frame stayed.

- `PoolRegistry.containsLedger` now verifies without `trusted` as an exact
  wrapper around a new public `ledgerPoolCount(registry, ledger)` observer:
  `containsLedger(registry, ledger) == (ledgerPoolCount(registry, ledger) > 0)`.
  The strengthened contract imports cleanly through both
  `playground/invar/dex2/lib/Dex.sr9` and
  `playground/invar/dex2/DexActorDemo.sr9` with the standard one-core command.

- Retried exact successful-delete reserve-total postconditions on
  `PoolRegistry.deletePool`, shaped as
  `reserveTotal(registry, info.ledgerA) + info.reserveA ==
  old(reserveTotal(registry, info.ledgerA))` and the same for `ledgerB`.
  Verification of `playground/invar/dex2/lib/PoolRegistry.sr9` failed both
  postconditions after the pool deletion path, even though `AssetTotals.debit`
  has exact value deltas. This looks like the same top-level projection/frame
  limitation around composing `Pool.info` snapshots, registry reserve totals,
  and pool-map deletion. The stronger reserve-total postconditions were
  reverted; no new trusted functions were added.

- A similar retry for `PoolRegistry.applyAdd` share-supply deltas failed at a
  local assertion after `Pool.applyAdd(pool, plan)`: the verifier could not
  prove that `totalShareSupply(registry, plan.poolKey)` equals the old supply
  plus `plan.shares + plan.lockedSharesAdded`, even though the child
  `Pool.applyAdd` mutator proves the exact `totalShares` delta. This is another
  imported/container projection issue for observing an updated opaque pool
  through the registry map. The attempted contract was reverted.

- Added `proofs/AttackObservers.sr9` with the first verified same-pool
  no-profit kernel. `swapBackSamePoolSystemClosedNoProfit` proves that if a
  successful A-to-B swap is followed by a B-to-A swap and the target-side pool
  reserve is restored, then `second.amountOut + first.platformFee ==
  first.amountIn`, so `second.amountOut <= first.amountIn`.
  `swapBackClosedTargetBalanceNoProfit` layers on the public-user target balance
  equation and proves `afterTarget <= beforeTarget`. This is a depth-2
  swap/swap kernel, not yet the full symbolic depth-1..4 action-list observer.
  Verified with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/proofs/AttackObservers.sr9`.

- `Dex.swap` now has a verified expected-failure frame for the caller's input
  token balance:
  on every `#err`, `localBalance(caller, AssetKey.ledger(ledgerIn))` is
  unchanged. The first attempt ignored the `Bool` returned by
  `BalanceBook.debit` and failed at the local refund assertion. Capturing the
  result and keeping the same defensive `if (not debited) return
  #err(#insufficientLocalBalance)` shape used by `beginWithdraw` lets the
  verifier consume `BalanceBook.debit`'s result-dependent postcondition. The
  contract imports through `InvariantObservers.sr9` and is also exposed on
  `DexActorDemo.swap`.

- `AttackObservers.sr9` now also has verified add/remove liquidity no-profit
  kernels. `addRemoveClosedLedgerANoProfit`,
  `addRemoveClosedLedgerBNoProfit`, and `addRemoveClosedBothLedgersNoProfit`
  prove that if the same LP shares are removed and the returned amount for each
  ledger is bounded by what the add spent, the caller's corresponding local
  balance cannot increase. These are depth-2 receipt/balance kernels; the full
  symbolic action-list observers for depths 1..4 remain open.

- Added bounded target-delta composition kernels in `AttackObservers.sr9`:
  `closedLoopNoProfitDepth1`, `closedLoopNoProfitDepth2`,
  `closedLoopNoProfitDepth3`, and `closedLoopNoProfitDepth4`. Each proves the
  common closed-loop implication: if the target asset's total received amount
  is no larger than its total spent amount and the final target balance equation
  is closed over those deltas, then `afterTarget <= beforeTarget`. The file also
  exposes receipt-to-delta helpers for swap input/output and add/remove
  liquidity ledger A/B effects. These are reusable proof kernels; the remaining
  work is wiring symbolic public action sequences into these deltas.

- Removed the remaining literal `ensures true` contracts from active DEX2 code.
  `PendingWithdrawals.get` now guarantees a non-null record has
  `debitAmount > 0`, and `PendingReturns.get` guarantees a non-null record has
  `localBalance > 0`. Exact contracts using
  `debitValue(pending, user, ledgerKey)` and
  `localBalanceValue(pending, user, ledgerKey)` verified in the leaf modules but
  failed when imported through `Dex.sr9`/`DexActorDemo.sr9` with insufficient
  permission for the child opaque pending handles. This is another
  import-time child opaque projection limitation. The committed positive-record
  contracts verify both as leaves and through the top-level actor.

- `Pool.planSwap`, `Pool.planAdd`, and `Pool.planRemove` now expose that a
  successful plan keeps the source pool key. `PoolRegistry.planSwap`,
  `PoolRegistry.planAdd`, and `PoolRegistry.planRemove` lift that to the
  canonical requested pair:
  `plan.poolKey == AssetKey.pool(ledgerA, ledgerB)`. The registry routes now
  defensively return `#poolNotFound` if the stored pool's internal key does not
  match the BMap key. This verified through `Pool.sr9`, `PoolRegistry.sr9`,
  `Dex.sr9`, `InvariantObservers.sr9`, and `DexActorDemo.sr9`.

- Tried to add a broad `Dex.liquidity` postcondition saying failed add/remove
  liquidity preserves the caller's pool-share balance. The mutation/refund
  branch can be asserted locally after the new canonical plan-key facts, but
  the exported postcondition still failed across early precheck branches that
  call read-only child modules (`LedgerSet`/`PoolRegistry`) before any balance
  mutation. This is the same parent-level frame retention limitation seen in
  earlier aggregate-total attempts. The broad postcondition was reverted; the
  local refund assertions and canonical plan-key facts stayed.

- `DexActorDemo.liquidity` now exposes the same successful LP-share movement
  guarantee as `Dex.liquidity`: under raw record-key distinctness between the
  pool-share slot and both real-ledger slots, successful add increases the
  caller's virtual pool balance by `receipt.shares`, and successful remove
  decreases it by `receipt.shares`. Unlike the earlier successful-swap
  output-balance attempt, this imported conditional postcondition verifies at
  the actor boundary.

- Retried a successful-swap local-obligation conservation postcondition on
  `Dex.swap`: on `#ok`, `localObligation` and `pendingOut` for both touched
  ledgers should be unchanged because the direct user/controller balance deltas
  and pool reserve deltas cancel. The implementation could assert the component
  facts locally in the success branch, but exporting them as a result-conditional
  postcondition first failed at the method postcondition and then, after
  shaping the return through a local `out` binding, triggered a Silicon backend
  failure with 0 source issues. Repro: add that conditional postcondition to
  `Dex.swap`, add matching success-branch assertions after the controller fee
  credit, then run
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/Dex.sr9`.
  A verbose retry with `--cores 4 --deterministic --viper-verbose` emitted
  `/tmp/sector9/sector9/viper/sector9-6a09d3.vpr` and ended in a Silicon stack
  trace around nested evaluation of `old(...)`/pure observer conjunctions. The
  attempted postcondition was reverted so the DEX gate can stay green.

- Added concrete receipt-level closed-loop observers to
  `AttackObservers.sr9`. Depth-1 kernels cover one action that only spends the
  target token (`singleSwapInputNoProfit`, `singleAddLedgerANoProfit`,
  `singleAddLedgerBNoProfit`). Depth-3 kernels cover
  swap-input/add/remove on the same pool for ledger A and ledger B. Depth-4
  kernels cover swap-out/swap-back/add/remove on the same pool for ledger A and
  ledger B. Together with the existing depth-2 swap-back and add/remove kernels,
  this gives verified no-profit receipt/balance facts for the main bounded
  action shapes without requiring the currently blocked top-level DEX state
  frame. Verified with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/proofs/AttackObservers.sr9`.

- Retried strengthening `LedgerAccounting.net` directly with settled-net facts:
  `settled(accounting, key) ==> net + outflow == inflow` and
  `not settled(accounting, key) ==> net == 0`. The leaf module verified, but
  importing it through `Dex.sr9` failed with two contract well-formedness
  errors around insufficient permission to unfold the parent `Dex.State` while
  checking the imported child `LedgerAccounting` postconditions. The same run
  also lost existing `Dex.swap`/`Dex.liquidity` `ledgerNet` preservation facts.
  Repro: add those two postconditions to `LedgerAccounting.net`, then run
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/Dex.sr9`.
  The postconditions were reverted; this remains an import-time child opaque
  projection/spec well-formedness blocker, not a failed arithmetic proof.

- Completed the symbolic bounded public-action no-profit observer pass in
  `AttackObservers.sr9`. A new `PublicAction` variant wraps successful
  `swap`, `liquidity(#add)`, and `liquidity(#rem)` receipts. The
  `actionTargetDelta` helper derives the target-token spend/receive effect for
  any target ledger, and `publicActionClosedLoopNoProfitDepth1` through
  `publicActionClosedLoopNoProfitDepth4` prove that any closed sequence whose
  target-token receipts are no larger than target-token spends cannot increase
  the attacker's target balance. Verified with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/proofs/AttackObservers.sr9`.

- Added an import-safe quote conservation surface. `PoolRegistry.quote` now
  explicitly frames `reserveTotal` for both quoted ledgers. With that lower
  frame, `Dex.quote` proves that every quote result, including expected errors,
  preserves `ledgerNet`, `localObligation`, and `pendingOut` for both touched
  ledgers. `InvariantObservers.quotePreservesLocalAccounting` and
  `DexActorDemo.quote` expose the same facts. Verified with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PoolRegistry.sr9`,
  `... --verify playground/invar/dex2/lib/Dex.sr9`,
  `... --verify playground/invar/dex2/proofs/InvariantObservers.sr9`, and
  `... --verify playground/invar/dex2/DexActorDemo.sr9`.

- Retried the analogous reserve-total frame on `PoolRegistry.createPool`.
  Runtime-wise this should hold because create-pool mutates only the pool map,
  ledger-pool counts, pool-key log, and next id; reserves stay untouched and new
  pools start with zero reserves. Verification still failed the postcondition
  `reserveTotal(registry, ledgerA) == old(reserveTotal(...))` immediately after
  the pool/count map mutation path, with a hint about exact field-level
  downstream facts from imported remote results. Repro: add reserve-total frame
  postconditions for `ledgerA`/`ledgerB` to `PoolRegistry.createPool` and run
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PoolRegistry.sr9`.
  The attempted contract was reverted; this is another parent opaque
  field-frame limitation for untouched child fields during sibling-field
  mutation.

- Added the import-safe create-pool result surface instead: successful
  `PoolRegistry.createPool`, `Dex.createPool`, and `DexActorDemo.createPool`
  now guarantee the returned pool key is `AssetKey.pool(ledgerA, ledgerB)` and
  the new pool has `reserveA == 0`, `reserveB == 0`, `totalShares == 0`, and
  `lockedShares == 0`. This proves the client-facing "empty pool, no summoned
  tokens or LP shares" fact without relying on the blocked untouched-reserves
  frame. Verified with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/PoolRegistry.sr9`,
  `... --verify playground/invar/dex2/lib/Dex.sr9`, and
  `... --verify playground/invar/dex2/DexActorDemo.sr9`.

- Added ledger-lifecycle accounting frames on `Dex.controllerAddLedger`,
  `Dex.controllerRetireLedger`, and `Dex.controllerRemoveLedger`: each preserves
  direct local totals, local obligation, pending-out, and ledger net for the
  touched ledger. `Dex.sr9` and `DexActorDemo.sr9` verify with these stronger
  contracts. `InvariantObservers.sr9` can import and prove the add/retire
  wrappers, but the remove wrapper failed to consume the imported
  `controllerRemoveLedger` postconditions for `localLedgerBalanceTotal` even
  though the DEX module itself verifies them. This appears to be the same
  imported parent-state/child-observer projection gap seen with other complex
  remove paths, so only the remove observer wrapper was dropped.

- Strengthened failed async-cleanup accounting facts. `Dex.finishWithdrawErr`,
  `Dex.finishWithdrawReject`, `Dex.finishReturnErr`, and
  `Dex.finishReturnReject` now prove that ledger net for the started ledger is
  unchanged. The existing local-balance refund facts remain unchanged, and
  `LedgerRoundTripObservers.sr9` imports the new ledger-net frames successfully.
  This does not yet prove the aggregate local-obligation/pending-out cleanup
  equation; previous attempts to expose those aggregate totals are still
  blocked by parent summary-total retention across pending/balance mutations.

- Retried removing the three `BalanceBook` listing trusted cuts with very weak
  runtime-snapshot contracts. First, removing all `ensures` failed at Viper
  translation because public methods over opaque handles must export at least
  one payload/effect contract. Next, result-size-only contracts such as
  `result.size() <= BSeq.size(book.holderLog)` were rejected as vacuous by the
  opaque-handle policy. Finally, adding the required model-relevant frame
  `model(book) == old(model(book))` reproduced the original proof failure for
  `balances` and `holders`, and `firstNonControllerHolder` also lost permission
  to call `model(book)` after calling `holders`. Repro command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify playground/invar/dex2/lib/BalanceBook.sr9`.
  The trusted cuts were restored; no new trusted functions were added.

- Strengthened share-supply facts that do verify without crossing a mutable map
  update. `Pool.info` now exposes the opaque pool health invariants: locked
  shares are bounded by total shares, zero-share pools have zero locked shares
  and zero reserves, and share-bearing pools have positive reserves. Separately,
  `PoolRegistry.lockedShareSupply` now proves
  `lockedShareSupply(registry, key) <= totalShareSupply(registry, key)`, and
  `Dex.lpLockedWithinSupply` lifts that fact to top-level DEX state. Verified:
  `Pool.sr9`, `PoolRegistry.sr9`, and `Dex.sr9`.

- Retried a direct registry-observer form for newly created pools:
  adding `totalShareSupply(registry, info.key) == 0` and
  `lockedShareSupply(registry, info.key) == 0` to
  `PoolRegistry.createPool`. It failed even though the receipt-level
  `info.totalShares == 0` and `info.lockedShares == 0` facts verify. This is
  the same container projection gap as the earlier `applyAdd` share-supply
  delta failure: the verifier can trust the fresh pool's receipt, but cannot
  re-observe the inserted opaque pool through the registry map strongly enough
  for the public observer. The attempted observer-form postconditions were
  reverted.

- Added `Dex.ledgerSettled` and a conditional deposit net-delta surface:
  successful `Dex.deposit` and `Dex.finishDepositOk` now prove that if the
  ledger accounting was settled before the deposit, `ledgerNet` increases by
  exactly the deposited amount. `InvariantObservers.depositPreservesAccountingBalanceWhenSettled`
  uses that with the existing local-obligation and pending-out deltas to prove
  that a successful deposit preserves the full conservation equation
  `ledgerNet == localObligation + pendingOut` for a settled ledger.

- Added verified LP-supply arithmetic kernels in `InvariantObservers.sr9`.
  `lpSupplyAddDeltasPreserveBalance` and
  `lpSupplyRemoveDeltasPreserveBalance` prove the add/remove equations needed
  for `totalShares == userShares + lockedShares` once the state-level deltas are
  available. These kernels intentionally avoid the currently blocked
  registry-map projection of updated opaque pool share totals.

- Strengthened the pool-level LP removal guard so `Pool.planRemove` rejects a
  request that would burn through locked shares (`shares + lockedShares >
  totalShares`) before returning a plan. `Pool.applyRemove` now also exposes the
  same successful-burn fact at the leaf pool boundary. Trying to lift that fact
  to `PoolRegistry.planRemove` as
  `plan.shares + lockedShareSupply(registry, plan.poolKey) <=
  totalShareSupply(registry, plan.poolKey)` failed in
  `PoolRegistry$planRemove` on the public observer projection through the
  registry map, even though the imported `Pool.planRemove` result-surface fact
  was available. This is another instance of the blocked parent/container
  summary projection issue around opaque values stored in maps. The lifted
  registry postcondition was reverted; the pool-level guard remains.

- Strengthened registry ledger-pool-count observers. `ledgerPoolCount` now
  exposes the exact cached count read, and the private `putCount` helper exposes
  exact same-key and other-key update facts. With those contracts,
  `PoolRegistry.deletePool` verifies exact successful decrements for the two
  removed-pool ledgers. `PoolRegistry.createPool` can prove body-level count
  assertions after the two updates, but exporting exact
  `ledgerPoolCount(registry, ledger) == old(ledgerPoolCount(...)) + 1`
  postconditions still fails at the method boundary. The public create contract
  now exposes the weaker but client-relevant facts
  `containsLedger(registry, ledgerA)` and `containsLedger(registry, ledgerB)`,
  which lift through `Dex.ledgerHasPool` and `DexActorDemo.createPool`.
  `InvariantObservers.createPoolMarksLedgersAsHavingPool` and
  `controllerRemoveLedgerLeavesNoPool` verify those lifecycle facts at the
  proof-observer layer.

- Verification pass for this slice succeeded with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 1 --verify`
  on `lib/Pool.sr9`, `lib/PoolRegistry.sr9`, `lib/Dex.sr9`,
  `DexActorDemo.sr9`, `proofs/InvariantObservers.sr9`,
  `proofs/LedgerRoundTripObservers.sr9`, and `proofs/AttackObservers.sr9`.

- OP7 follow-up on 2026-05-18: the active DEX2 code now has zero `trusted`
  functions. `BalanceBook.balances`, `BalanceBook.holders`,
  `BalanceBook.firstNonControllerHolder`, `PoolRegistry.list`, and
  `Dex.removePool` are ordinary verified functions. The listing helpers use
  explicit field-level read-only loop frames, `PoolRegistry.list` observes pool
  handles through `Pool.info`, and `Dex.removePool` reads holder balances
  through the top-level `Dex.localBalance` surface inside its settlement loop.

- Tightened `Dex.removePool` while removing the proof cut: settlement is now
  gated by `PoolRegistry.deletePool`. If registry deletion fails, the function
  returns `#err(#poolNotFound)` before converting local LP balances. This avoids
  the old fail-open shape where the delete result was ignored after settlement.

- Tried to assert the LP-share debit result directly in `Dex.removePool`:
  `let debited = BalanceBook.debit(...); assert debited;`. Verification failed
  at that assertion because the current `BalanceBook` contracts expose local
  balances and cached totals separately, but do not prove an invariant that the
  cached total is always at least each individual holder balance. Runtime state
  reaches that condition through the module transitions, but the verifier needs
  a stronger BalanceBook-level aggregate invariant or debit success
  postcondition to consume it locally. The assertion was removed and the
  verified deletion-first settlement shape was kept.

- Full DEX2 gate passed after OP7 cleanup:
  `JOBS=4 XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1 ./scripts/run-op6-dex2-gate.sh`.
  Timing logs were written to `/tmp/op6-dex2-logs.zQtV3d`. The slowest
  `verify.pipeline_viper_files` entries were `InvariantObservers.sr9`
  200.385s, `DexActorDemo.sr9` 194.760s,
  `LedgerRoundTripObservers.sr9` 192.087s, and `Dex.sr9` 173.712s.

- OP7 follow-up listing contracts on 2026-05-18:
  `BalanceBook.balances` now proves every returned `(ledgerKey, amount)` entry
  has `amount > 0` and matches the book model for that user/key.
  `BalanceBook.holders` now proves every returned holder has a positive
  balance for the requested key, and `firstNonControllerHolder` exposes the
  same fact for a non-null result. These guarantees verified once the listing
  loops used direct private `mapGet` reads instead of routing through the public
  `get` helper inside quantified sequence invariants.

- `PoolRegistry.list` now proves every returned `PoolInfo` is healthy: the
  ledgers differ, locked shares are bounded by total shares, empty pools have
  zero reserves and locked shares, and live share-bearing pools have positive
  reserves. `Dex.pools` and `DexActorDemo.pools` lift that payload guarantee to
  the public surfaces. The full DEX2 gate passed with these additions:
  `JOBS=4 XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1 ./scripts/run-op6-dex2-gate.sh`.
  Timing logs were written to `/tmp/op6-dex2-logs.a1EYv2`; the slowest
  `verify.pipeline_viper_files` entries were `DexActorDemo.sr9` 213.214s,
  `InvariantObservers.sr9` 204.221s, `LedgerRoundTripObservers.sr9` 198.450s,
  and `Dex.sr9` 177.742s.

- Tried to lift the `BalanceBook.balances` payload guarantee through
  `Dex.balances`. Keeping the postcondition at the parent `State` boundary did
  not verify cleanly: the parent owner summary could not consume the child
  `BalanceBook` payload predicate, and forcing the assertion over the tuple
  array snapshot also hit a Viper type error. The verified guarantee remains at
  the BalanceBook module boundary for now; lifting it should be retried after
  parent/child opaque summary projection and tuple-array snapshot handling are
  improved.

- Post-OP7 improvement on 2026-05-18: pool listings now prove canonical keys.
  `PoolRegistry.list` filters out any internally inconsistent pool record whose
  reported `PoolInfo.key` does not match both the registry scan key and
  `AssetKey.pool(info.ledgerA, info.ledgerB)`. The new
  `PoolRegistry.poolInfoCanonical` predicate is exposed on every listed pool,
  and the guarantee lifts through `Dex.pools` and `DexActorDemo.pools`.
  Full gate passed with
  `JOBS=4 XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1 ./scripts/run-op6-dex2-gate.sh`.
  Timing logs were written to `/tmp/op6-dex2-logs.kReQrp`; the slowest
  `verify.pipeline_viper_files` entries were `InvariantObservers.sr9`
  210.685s, `DexActorDemo.sr9` 210.238s,
  `LedgerRoundTripObservers.sr9` 202.062s, and `Dex.sr9` 180.460s.

- SR9 ergonomics/performance issue found while trying to strengthen
  `BalanceBook`: adding a global opaque invariant of the form
  `forall user,key. balance(user,key) <= total(key)` typechecked, but made
  `BalanceBook.sr9` spin in Silicon for several minutes and spawn a large
  number of Z3 workers. This was backed out. The proof we want is a common
  aggregate relation between a flat per-record map and a cached per-asset
  total, but expressing it as an unconstrained nested `forall` is too expensive
  and gives poor feedback. A useful verifier improvement would be an indexed
  aggregate-invariant pattern, better quantifier trigger control, or a timeout
  diagnostic that names the invariant/function pair causing the solver blowup.
  Repro: add the invariant to `BalanceBook.BalanceBook` and run
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 4 --verify playground/invar/dex2/lib/BalanceBook.sr9`.

- SR9 ergonomics issue retried on `PoolRegistry.deletePool`: exact reserve-total
  deltas still do not lift cleanly. Adding postconditions
  `reserveTotal(registry, info.ledgerA) + info.reserveA == old(reserveTotal(...))`
  and the same for ledger B failed at the local assertion immediately after
  `AssetTotals.debit`. Even introducing explicit `reserveABefore` and
  `reserveBBefore` snapshots failed to prove those snapshots equal the `old`
  observer values. The diagnostic correctly hints that this is an imported
  field-level downstream fact, but the proof is awkward because the registry
  method owns the child `AssetTotals` object. A useful verifier improvement
  would retain or re-export exact child-observer snapshots across imported
  opaque child calls without requiring DEX-specific wrapper facts. Repro:
  add those postconditions/assertions to `PoolRegistry.deletePool` and run
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 4 --verify playground/invar/dex2/lib/PoolRegistry.sr9`.

- Post-OP7 attack-observer improvement on 2026-05-18: added verified depth-5
  same-pool public-action closed-loop no-profit kernels:
  `closedLoopNoProfitDepth5` and `publicActionClosedLoopNoProfitDepth5`.
  Direct verification passed with
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 4 --verify playground/invar/dex2/proofs/AttackObservers.sr9`.

- Post-OP7 attack-observer improvement on 2026-05-18: extended the same
  public-action closed-loop no-profit shape through depth 6 with
  `closedLoopNoProfitDepth6` and `publicActionClosedLoopNoProfitDepth6`.
  Direct verification passed with
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores 4 --verify playground/invar/dex2/proofs/AttackObservers.sr9`.
  Full DEX2 gate also passed:
  `JOBS=4 XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1 ./scripts/run-op6-dex2-gate.sh`.
  Timing logs were written to `/tmp/op6-dex2-logs.YekuVA`; the slowest
  `verify.pipeline_viper_files` entries were `InvariantObservers.sr9`
  204.572s, `DexActorDemo.sr9` 199.114s,
  `LedgerRoundTripObservers.sr9` 196.118s, and `Dex.sr9` 178.063s.

- Tried to strengthen `BalanceBook.debit` with direct guard-sufficiency facts:
  successful debit implies `old(get(book, user, key)) >= amount` and
  `old(total(book, key)) >= amount`, while failed debit implies one of those old
  values was insufficient. Direct verification failed on the first success
  postcondition even though the existing contract already proves
  `get(book, user, key) + amount == old(get(book, user, key))` on success.
  Adding local pre-mutation snapshots (`beforeBalance = get(...)`,
  `beforeTotal = total(...)`) and assertions tying those snapshots to the
  private `mapGet` reads did not help. Command:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores
  4 --verify playground/invar/dex2/lib/BalanceBook.sr9`. This is an
  ergonomics gap: callers want a simple old-balance sufficiency fact, but the
  verifier does not derive it from the exact additive postcondition or from
  obvious pre-mutation snapshots over the same opaque handle.

- Post-OP7 conservation improvement on 2026-05-18: added state-level observers
  over real `Dex` transitions that prove the full equation
  `ledgerNet == localObligation + pendingOut`, not just arithmetic helper
  kernels. The new observers cover `finishDepositOk` for settled ledgers,
  `beginDeposit`, failed deposit cleanup (`finishDepositErr` and
  `finishDepositReject`), controller add/retire/final-remove ledger lifecycle
  transitions, and `quote` for both touched ledgers. Direct observer
  verification passed with:
  `XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --cores
  4 --verify playground/invar/dex2/proofs/InvariantObservers.sr9`.
  Full DEX2 gate also passed:
  `JOBS=4 XDG_CACHE_HOME=/tmp/sector9 S9_VIPER_TIMING=1 ./scripts/run-op6-dex2-gate.sh`.
  Timing logs were written to `/tmp/op6-dex2-logs.dbXf2C`; the slowest
  `verify.pipeline_viper_files` entries were `DexActorDemo.sr9` 209.750s,
  `InvariantObservers.sr9` 205.550s, `LedgerRoundTripObservers.sr9` 196.356s,
  and `Dex.sr9` 175.340s.
