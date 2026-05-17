# DEX2 Spec

This is the planned replacement for the current playground DEX. The design is
local-balance first: users deposit ICRC tokens into the actor, and swap/add/remove
liquidity only move balances inside the DEX state. User ledger calls happen in
`deposit` and `withdraw`; `controller_ledger(#add ...)` reads the ledger fee
once; and the controller-only cleanup path `returnLedgerBalances` can call
ledgers to return local balances before ledger removal.

## Security Model

The DEX can prove local accounting and AMM safety properties. It cannot prove
that an arbitrary remote principal is a correct ICRC ledger. For v1, the
controller only whitelists standard ICRC ledgers that implement the expected
ICRC semantics:

- a successful `icrc2_transfer_from` moves exactly `amount` into the DEX account;
- a successful `icrc1_transfer` moves exactly `amount` out of the DEX account and
  charges the fee accepted by the ledger;
- `icrc1_fee` returns the fee the ledger currently expects when the controller
  adds the ledger;
- if the ledger fee changes later, `#BadFee { expected_fee }` reports the new
  accepted fee so the DEX can refresh its cache before the next transfer;
- ledger calls do not lie by returning success without applying the matching
  ledger state change.

Standard does not mean always live. A trusted ledger may be temporarily
unavailable, may return `#TemporarilyUnavailable`, or may reject because the
ledger canister is offline or out of cycles. Those are liveness failures, not
accounting failures. The DEX must treat them as expected external failures:
refund or avoid local mutation, keep the ledger entry and cached fee intact
unless a `#BadFee` response gives a new fee, and let clients retry later.

Everything after a trusted ledger reports success is local and should be
verified. The main proof goals are:

- no expected user or ledger failure traps the actor;
- failed calls leave all local state unchanged, except failed withdrawals that
  must restore the exact pending debit before returning;
- successful external transfers have exact local accounting deltas;
- every local balance debit is guarded before any dependent state mutation;
- pool reserves, LP-share supply, pending withdrawals, and ledger accounting stay
  linked by explicit summary invariants;
- quote and swap use the same exact math, with swap recomputing from the current
  pool state and enforcing `amountOut >= minAmountOut`.

## Actor API

The actor should expose these user-facing funcs:

```motoko
public shared({ caller }) func deposit(
  ledger : Principal,
  amount : Nat
) : async Result<DepositReceipt, DepositError>

public shared({ caller }) func withdraw(
  ledger : Principal,
  amount : Nat
) : async Result<WithdrawReceipt, WithdrawError>

public query func quote(
  ledgerIn : Principal,
  ledgerOut : Principal,
  amountIn : Nat,
  minAmountOut : Nat
) : async Result<QuoteReceipt, QuoteError>

public shared({ caller }) func swap(
  ledgerIn : Principal,
  ledgerOut : Principal,
  amountIn : Nat,
  minAmountOut : Nat
) : async Result<SwapReceipt, SwapError>

public shared({ caller }) func liquidity(
  request : LiquidityRequest
) : async Result<LiquidityReceipt, LiquidityError>

public query func balances(user : Principal) : async [(Text, Nat)]

public query func pools() : async [PoolInfo]
```

Controller-facing:

```motoko
public type ControllerLedgerAction = {
  #add : Principal;
  #retire : Principal;
  #rem : Principal;
};

public shared({ caller }) func controller_ledger(action : ControllerLedgerAction) : async Result<(), ControllerLedgerError>

public shared({ caller }) func createPool(
  ledgerA : Principal,
  ledgerB : Principal
) : async Result<PoolInfo, CreatePoolError>

public shared({ caller }) func removePool(
  ledgerA : Principal,
  ledgerB : Principal
) : async Result<RemovePoolReceipt, RemovePoolError>

public shared({ caller }) func returnLedgerBalances(
  ledger : Principal
) : async Result<ReturnLedgerBalancesReceipt, ReturnLedgerBalancesError>
```

`controller_ledger`, `createPool`, `removePool`, and `returnLedgerBalances` are
gated by `caller == controller`. Ledger removal is a two-stage lifecycle:
retirement first blocks new exposure, and final removal is strict. A ledger
cannot be removed while any local DEX state still references it.

```motoko
public type LedgerStatus = { #active; #retiring };

public type LedgerInfo = {
  status : LedgerStatus;
  fee : Nat;
};
```

- `#active` ledgers can be used for deposits, withdrawals, pool creation, quotes,
  swaps, and add liquidity.
- `#retiring` ledgers cannot be used for new deposits, pool creation, quotes,
  swaps, or add liquidity. They can still be used for exits: user withdrawals,
  user remove-liquidity, controller pool removal, forced balance returns, and
  final ledger removal.
- `controller_ledger(#add ledger)` reads `ledger.icrc1_fee()`, then creates an
  active ledger entry with that cached fee.
- `controller_ledger(#retire ledger)` moves an active ledger to `#retiring`.
  It does not require balances or pools to be empty. In-flight deposits that
  started before retirement may still finish; their guard blocks final removal.
- `controller_ledger(#rem ledger)` removes a retiring ledger only when all of
  these are true:
  - no pool contains the ledger;
  - no user has a local balance at `AssetKey.ledger(ledger)`;
  - no pending withdrawal, forced return, or in-flight deposit references the
    ledger.
- `#rem` on an active ledger returns `#err(#ledgerNotRetiring ledger)`.
- If any pool still contains the ledger, `#rem` returns
  `#err(#ledgerHasPools ledger)`. Pools must be removed first.
- If any local user balance remains, `#rem` returns
  `#err(#ledgerHasLocalBalances ledger)`. Users can withdraw themselves, or the
  controller can call `returnLedgerBalances`.
- If the ledger has pending external work, `#rem` returns
  `#err(#ledgerHasPendingOps ledger)`.
- `#rem` on an absent ledger returns `#err(#ledgerNotWhitelisted ledger)`.
- `#retire` on an absent ledger returns `#err(#ledgerNotWhitelisted ledger)`.
- `#retire` on an already retiring ledger is idempotent and returns `#ok(())`.

The important safety rule is that removing a ledger must never strand local
balances or pool reserves. The removal order is:

```text
controller_ledger(#retire ledger)
remove pools containing ledger
return or withdraw all local balances for ledger
controller_ledger(#rem ledger)
```

Actor funcs with expected failures return a result variant:

```motoko
public type Result<Ok, Err> = { #ok : Ok; #err : Err };
```

Successful result calls return `#ok(value)`. Expected failures return
`#err(error)` and should not trap. Snapshot queries that cannot fail, like
`balances` and `pools`, return their payload directly.

## Ledger Interface

Use the core ICRC ledger pattern we already made. The actor builds a ledger
actor from the ledger principal at each external boundary:

```motoko
let ledger = ICRCLedger.fromPrincipal(ledgerPrincipal);
```

The actor owns the `await` and every local state change still goes through
`Dex.sr9` pre-await/post-await transitions:

```motoko
public shared({ caller }) func deposit(ledger : Principal, amount : Nat)
  : async Result<DepositReceipt, DepositError>
{
  switch (Dex.beginDeposit(dex, ledger, amount)) {
    case (#err err) { #err(err) };
    case (#ok _) {
      let remote = ICRCLedger.fromPrincipal(ledger);
      try {
        let result = await remote.icrc2_transfer_from(args);
        switch (result) {
          case (#Ok txIndex) { Dex.finishDepositOk(dex, caller, ledger, amount, txIndex) };
          case (#Err err) { Dex.finishDepositErr(dex, ledger, err) }
        }
      } catch (_) {
        Dex.finishDepositReject(dex, ledger, reject)
      }
    }
  }
}
```

`withdraw`, `returnLedgerBalances`, and `controller_ledger(#add ...)` follow the
same pre-await/await/post-await pattern. An earlier design used a
`LedgerOps.sr9` async helper module, but the current verifier rejects public
`async*` signatures containing opaque `Dex.State` handles and also fails
lowering imported-module `async*` helpers that perform `await`. The helper file
has therefore been removed for this pass. `quote`, `swap`, `liquidity`,
`controller_ledger(#retire ...)`, `controller_ledger(#rem ...)`, `createPool`,
`removePool`, `balances`, and `pools` remain direct local calls into `Dex.sr9`
and do not use `await*`.

The actor keeps the public controller entrypoint as `controller_ledger(action)`.
Only the `#add` branch awaits:

```motoko
public shared({ caller }) func controller_ledger(action : ControllerLedgerAction)
  : async Result<(), ControllerLedgerError>
{
  switch action {
    case (#add ledger) {
      switch (Dex.controllerAddLedgerPrecheck(dex, caller, ledger)) {
        case (#err err) { #err(err) };
        case (#ok _) {
          let remote = ICRCLedger.fromPrincipal(ledger);
          try {
            let fee = await remote.icrc1_fee();
            Dex.controllerAddLedger(dex, caller, ledger, fee)
          } catch (_) {
            #err(#ledgerFeeRejected(ledgerReject()))
          }
        }
      }
    };
    case (#retire ledger) { Dex.controllerRetireLedger(dex, caller, ledger) };
    case (#rem ledger) { Dex.controllerRemoveLedger(dex, caller, ledger) };
  }
}
```

Required ICRC calls:

- `deposit` uses `icrc2_transfer_from`.
- `deposit` does not need a separate `icrc2_allowance` pre-check. The
  authoritative result is `icrc2_transfer_from`: `#Ok(txIndex)` credits the
  local balance, and `#Err(#InsufficientAllowance ...)` returns a deposit error
  with no local state change.
- `withdraw` uses `icrc1_transfer`.
- `controller_ledger(#add ledger)` reads `icrc1_fee` once and stores it in the
  ledger entry as `LedgerInfo.fee`.
- `withdraw` does not read `icrc1_fee` on every call. It uses the cached
  `LedgerInfo.fee`, passes that value as `fee = ?fee`, and charges the same
  cached fee locally.
- If `withdraw` receives `#Err(#BadFee { expected_fee })`, it refunds local
  state, updates the cached ledger fee to `expected_fee`, and returns the
  transfer error. It does not retry the transfer inside the same call.
- If `deposit` unexpectedly receives `#Err(#BadFee { expected_fee })` from
  `icrc2_transfer_from`, it also refreshes the cached fee and returns the
  deposit error without crediting local balance.
- `returnLedgerBalances` uses `icrc1_transfer` with the same explicit-fee and
  cached-fee, BadFee-refresh, and pending-refund discipline as `withdraw`, but
  it is controller-only and exists only to drain local balances before ledger
  removal.

Controller ledger add flow:

1. The actor first asks `Dex.sr9` for a local precheck:
   caller must be the controller and the ledger must be absent. This precheck
   does not mutate state.
2. It calls `ledger.icrc1_fee()`.
3. If the fee call returns `fee`, it calls `Dex.controllerAddLedger(caller,
   ledger, fee)` to store `{ status = #active; fee }`. This local commit
   rechecks that the ledger is still absent, because another controller message
   could have added it while the fee call was awaiting.
4. If the fee call rejects, it returns `#err(#ledgerFeeRejected ...)` and leaves
   the ledger set unchanged.

The core pattern endpoint responses are:

```motoko
icrc1_balance_of(account) : async Nat
icrc1_fee() : async Nat
icrc1_total_supply() : async Nat
icrc1_transfer(arg) : async ICRCLedger.TransferResult
icrc2_allowance(args) : async ICRCLedger.AllowanceResult
icrc2_transfer_from(args) : async ICRCLedger.TransferFromResult

public type TransferResult = { #Ok : Nat; #Err : TransferError };
public type TransferFromResult = { #Ok : Nat; #Err : TransferFromError };
```

The `Nat` inside `#Ok` is the ledger transaction index. DEX deposit and withdraw
receipts should return this index so clients can correlate local DEX receipts
with ledger transactions.

`ICRCLedger.TransferError` variants:

```motoko
{
  #GenericError : { message : Text; error_code : Nat };
  #TemporarilyUnavailable;
  #BadBurn : { min_burn_amount : Nat };
  #Duplicate : { duplicate_of : Nat };
  #BadFee : { expected_fee : Nat };
  #CreatedInFuture : { ledger_time : Nat64 };
  #TooOld;
  #InsufficientFunds : { balance : Nat };
}
```

`ICRCLedger.TransferFromError` has the same variants plus:

```motoko
#InsufficientAllowance : { allowance : Nat }
```

All ledger awaits must be wrapped so remote rejects become `#err(...)` responses
instead of actor traps. Only a ledger `#Ok(...)` transfer result is treated as
success. Ledger `#Err(...)` results and call rejects are failures. `#Duplicate`
and `#BadFee` are ordinary `#Err(...)` variants and must not be treated as
success. In particular, do not credit a deposit for an ICRC duplicate response;
otherwise a retried call could double-credit local balance without a matching
new transfer.

Offline or cycle-starved ledger behavior:

- A reject from `icrc2_transfer_from` means no deposit credit and the in-flight
  deposit guard is cleared.
- A reject from `icrc1_transfer` during `withdraw` means the pending debit is
  fully restored before returning.
- A reject from `icrc1_transfer` during `returnLedgerBalances` means the user's
  full pending local balance is restored before returning.
- A reject from `icrc1_fee()` during `controller_ledger(#add ...)` means the
  ledger is not added. The controller can retry after the ledger is live again.
- `#TemporarilyUnavailable` is just a ledger `#Err(...)` response. It follows
  the same refund/no-credit rules as any other transfer error.
- Liveness failures never automatically retire, remove, or mark a ledger bad.
  Ledger lifecycle changes remain explicit controller actions.

The actor uses only default user accounts in v1:

- deposit `from = { owner = caller; subaccount = null }`
- deposit spender is the DEX actor default account because
  `spender_subaccount = null`
- deposit `to = { owner = DEX actor principal; subaccount = null }`
- withdraw source is the DEX actor default account because
  `from_subaccount = null`
- withdraw `to = { owner = caller; subaccount = null }`
- forced return `to = { owner = user; subaccount = null }`

Supporting user-selected subaccounts later should be a separate API change with
matching balance keys or receipt fields.

## Local Balances And Asset Keys

We need one user balance query and one balance book. Balances are keyed by
`Text`, not directly by ledger `Principal`, so the same book can hold both real
ledger balances and LP positions.

Use one key module for every public and internal balance key:

- `AssetKey.sr9`
  - `ledger(ledger : Principal) : Text`
  - `pool(ledgerA : Principal, ledgerB : Principal) : Text`
  - proof helpers that state pool keys are symmetric and real-ledger keys cannot
    collide with pool keys

```text
BalanceBook
  recordKey(user Principal, assetKey Text) -> Nat
  assetKey Text -> total Nat
```

Balance storage is split into small opaque modules:

- `AssetTotals.sr9`: reusable opaque `Text -> Nat` total map.
- `BalanceBook.sr9`: flat per-user/per-asset records plus a cached total that
  tracks the total user-held amount for every asset key.

Expected funcs:

```motoko
balances(book, user) : [(Text, Nat)]
get(book, user, assetKey) : Nat
credit(book, user, assetKey, amount)
debit(book, user, assetKey, amount) : Bool
total(book, assetKey) : Nat
holders(book, assetKey) : [Principal]
```

`debit` returns `false` and leaves state unchanged when the user does not have
enough local balance. `get` and `total` are internal/proof helpers, not actor
per-asset query funcs. `total` lets the top-level DEX prove reserve accounting
without quantifying through the nested user map every time.
`holders` returns a deterministic list of users with positive balance for an
asset key. It is needed for controller pool removal and ledger-balance return.

`balances(user)`, `holders(assetKey)`, and `pools()` are snapshot/listing
surfaces. Runtime code scans append-only key logs and rechecks the live map
entry before emitting each item, so stale log entries are ignored. Clients must
not depend on list ordering or uniqueness as an accounting guarantee. The
verified accounting surface is `get`/`total` plus the transition postconditions
that update those totals; list outputs are for discovery and display.

Local balances are the only balances used by `swap` and `liquidity`. Those funcs
do not call external ledgers.

Asset key rules:

- Real ledger balance key: `AssetKey.ledger(ledger)`, encoded as
  `"ledger:" # Principal.toText(ledger)`.
- Pool LP-position key: `AssetKey.pool(ledgerA, ledgerB)`.
- `AssetKey.pool` is canonical and unordered:

```motoko
switch (Principal.compare(ledgerA, ledgerB)) {
  case (#less) {
    "pool:" # Principal.toText(ledgerA) # ":" # Principal.toText(ledgerB)
  };
  case (#equal) {
    "pool:" # Principal.toText(ledgerA) # ":" # Principal.toText(ledgerB)
  };
  case (#greater) {
    "pool:" # Principal.toText(ledgerB) # ":" # Principal.toText(ledgerA)
  };
}
```

That means a pool between `A` and `B` has one virtual ledger key regardless of
whether the user interacts with it as `A/B` or `B/A`. User LP positions are just
balances at that pool key. The `ledger:` / `pool:` prefixes are deliberate: they
give us a simple invariant that a real token balance can never be confused with a
virtual LP balance.

## Deposit

`deposit(ledger, amount)`:

1. Requires `amount > 0`.
2. Requires `ledger` is active when the external `transfer_from` is started.
3. Records an in-flight deposit guard for `ledger`. This guard does not credit
   user balance and is not part of token obligation accounting; it only blocks
   `controller_ledger(#rem ledger)` while the external transfer is in flight.
4. The actor builds the ledger actor from `ledger : Principal`.
5. The actor calls `icrc2_transfer_from`:
   - `from.owner = caller`
   - `from.subaccount = null`
   - `to.owner = DEX actor principal`
   - `to.subaccount = null`
   - `fee = null`
   - `spender_subaccount = null`
   - `memo = null`
   - `created_at_time = null`
   - `amount = amount`
   Because `spender_subaccount = null`, the user must have approved the DEX
   actor's default account as spender.
6. If the ledger returns `#Ok(txIndex)`, clear the in-flight deposit guard, call
   `Dex.deposit(caller, ledger, amount)`, which credits
   `BalanceBook[caller][AssetKey.ledger(ledger)]` and records settled inflow,
   then return `#ok({ ledger; amount; txIndex; balanceKey })`.
7. If the ledger returns `#Err(err)`, clear the in-flight deposit guard, return
   `#err(#ledgerTransferFromErr err)`, and do not change local balances. This
   includes `#Duplicate`, `#BadFee`, `#InsufficientAllowance`, and
   `#InsufficientFunds`. If `err` is `#BadFee { expected_fee }`, refresh the
   cached ledger fee before returning.
8. If the remote call rejects, clear the in-flight deposit guard, return
   `#err(#ledgerTransferFromRejected ...)`, and do not change local balances.

Deposit should do no user-balance mutation before the external call. The only
pre-await mutation is the in-flight deposit guard needed to make strict ledger
removal safe. After a successful transfer, the remaining local credit step must
be simple and should not trap.

A deposit that started while the ledger was active may finish after the
controller moves that ledger to `#retiring`. The matching in-flight guard is the
authority for that post-await credit. Final ledger removal remains blocked until
the guard is cleared and the credited local balance is later withdrawn or force
returned.

The in-flight deposit guard is not token accounting and does not mean "pending
deposit credit." It exists only because `controller_ledger(#rem ledger)` is a
local call that could otherwise remove a ledger while an older `deposit` is
awaiting `icrc2_transfer_from`. If that transfer later returns `#Ok(txIndex)`,
the DEX would have real tokens for a ledger that is no longer whitelisted. The
guard blocks removal until the transfer either succeeds and is credited or fails
and is ignored.

## Withdraw

`withdraw(ledger, amount)`:

1. Requires `amount > 0`.
2. Requires `ledger` is listed (`#active` or `#retiring`).
3. Reads `fee` from the cached `LedgerInfo.fee`.
4. Computes `debitAmount = amount + fee`.
5. In the same public `withdraw` call, before awaiting the transfer, atomically:
   - checks that there is no pending withdrawal for `(caller, ledger)`
   - checks `BalanceBook[caller][AssetKey.ledger(ledger)] >= debitAmount`
   - debits `BalanceBook[caller][AssetKey.ledger(ledger)]` by `debitAmount`
   - records a pending withdrawal with `amount`, `fee`, and `debitAmount`
6. If the pre-await pending step fails, returns the matching `#err(...)` with no
   local partial state left behind.
7. The actor calls `icrc1_transfer` to `caller`:
   - `to.owner = caller`
   - `to.subaccount = null`
   - `fee = ?fee`
   - `memo = null`
   - `from_subaccount = null`
   - `created_at_time = null`
   - `amount = amount`
8. The same public `withdraw` call resumes after `await`.
9. If the ledger returns `#Ok(txIndex)`, records settled outflow of
   `debitAmount`, clears the pending withdrawal, and returns
   `#ok({ ledger; amount; fee; debitAmount; txIndex; balanceKey })`.
10. If the ledger returns `#Err(err)`, moves the full pending `debitAmount` back
   to the user's local balance, clears the pending withdrawal, refreshes the
   cached fee when `err` is `#BadFee { expected_fee }`, and returns
   `#err(#ledgerTransferErr err)`.
11. If the remote call rejects, moves the full pending `debitAmount` back to the
   user's local balance, clears the pending withdrawal, and returns
   `#err(#ledgerTransferRejected ...)`.

There are no public `beginWithdraw`, `finishWithdraw`, or pending-withdraw actor
methods. Pending withdrawal is only internal state used by the single public
`withdraw` method while it is suspended at the external ledger `await`.

The user pays the withdrawal fee from local balance. This keeps the local book
aligned with the actor's real ledger balance: the ledger debits the actor by
`amount + fee`, and the local book also debits `amount + fee`.

Every successful deposit/withdraw updates internal ledger accounting:

- successful deposit: `ledgerInflow[ledger] += amount`
- successful withdraw: `ledgerOutflow[ledger] += amount + fee`

Failed ledger calls do not update inflow/outflow.

## Controller Return Ledger Balances

`returnLedgerBalances(ledger)` is a controller-only cleanup helper for ledger
removal. It exists because `controller_ledger(#rem ledger)` must fail while any
local balance remains at `AssetKey.ledger(ledger)`.

Rules:

- Requires `caller == controller`.
- Requires `ledger` is retiring.
- Requires no pool contains `ledger`; pools must be removed before real ledger
  balances are force-returned.
- Requires no pending withdrawal, pending forced return, or in-flight deposit
  currently references `ledger`; otherwise return `#err(#ledgerHasPendingOps ledger)`.
- Uses the core ICRC ledger actor for `ledger`.
- Returns users' local balances to their default accounts:
  `{ owner = user; subaccount = null }`.
- Uses the same pending/refund discipline as `withdraw`: after a user balance is
  moved to pending, every failed transfer or remote reject restores the exact
  pending amount before the public call returns.

Fee policy:

- Forced returns deduct the ledger transfer fee from the user being returned.
- For a non-controller user with local balance `localBalance`, the net transfer
  amount is `returnedAmount = localBalance - cachedFee`.
- If `localBalance <= cachedFee`, stop before mutating state and return
  `#err(#returnBalanceDoesNotCoverFee { balance = localBalance; fee = cachedFee })`.
  This avoids a controller-forced cleanup call silently converting a user's
  whole local balance into fees while returning nothing.
- Dust balances that cannot cover a positive returned amount plus fee are an
  explicit removal blocker in v1. They need a later, explicit dust policy rather
  than hidden confiscation in `returnLedgerBalances`.
- The controller should withdraw its own remaining local balance normally. Ledger
  removal still fails until the controller's local balance is also zero.

For v1, process at most one deterministic non-controller holder per call. This
keeps the result atomic: `#err` means no local state changed for that attempted
holder. Repeated calls drain the holder set. A later batched version may process
more than one holder only if its receipt reports per-holder progress precisely.
If no positive non-controller holder remains, return `#ok` with
`returnedUsers = 0`, `returnedUser = null`, `localBalance = 0`, `fee = 0`,
`returnedAmount = 0`, and `txIndex = null`.

For the processed non-controller user with local balance `localBalance > 0`:

1. Read `fee` from the cached `LedgerInfo.fee`.
2. Require `localBalance > fee`.
3. Compute `returnedAmount = localBalance - fee`.
4. Atomically move the full `localBalance` from the user's local balance into
   pending forced return state.
5. Call `icrc1_transfer` to the user for `returnedAmount`, with `fee = ?fee`.
6. On `#Ok(txIndex)`, record ledger outflow of `localBalance` and clear pending.
7. On `#Err(err)` or remote reject, restore the full `localBalance`, clear
   pending, refresh the cached fee when `err` is
   `#BadFee { expected_fee }`, and return the matching error.

The proof obligation is per processed user: successful forced return reduces
local obligations and settled ledger net by exactly `localBalance`; failed forced
return restores the exact pre-call local balance for that user.

## Reentrancy

`withdraw` awaits an external ledger transfer, so it needs explicit in-flight
state. This should be more than a Bool guard: the pending withdrawal amount is
part of the accounting invariant while the actor is waiting for the ledger.

```text
PendingWithdrawals
  user Principal -> UserPendingWithdrawals

UserPendingWithdrawals
  ledgerKey Text -> PendingWithdrawal

PendingWithdrawal
  amount : Nat
  fee : Nat
  debitAmount : Nat
```

Rules:

- The pending check happens inside the public `withdraw` method immediately
  after reading the cached fee, so another message cannot slip between the check
  and the local debit.
- The pre-await local step must debit through `BalanceBook.debit`; if the user
  does not have at least `amount + fee` at `AssetKey.ledger(ledger)`, it returns
  `#err(#insufficientLocalBalance)` and leaves balances and pending withdrawals
  unchanged.
- After the local debit succeeds and before the external transfer call, `withdraw`
  records
  `PendingWithdrawals[caller][AssetKey.ledger(ledger)] = { amount; fee; debitAmount }`.
- Reject another `withdraw` for the same `(caller, ledger)` while a pending entry
  exists.
- When the same `withdraw` resumes with a successful ledger transfer, it records
  outflow of `debitAmount` and clears the pending entry.
- When the same `withdraw` resumes with a failed ledger transfer or call reject,
  it credits `debitAmount` back to the user balance, clears the pending entry,
  and does not update ledger accounting.
- Do not hold a global guard. A user withdrawing ledger `A` should not block
  another user or the same user withdrawing ledger `B`.
- `deposit` records only an in-flight deposit guard before its external
  `transfer_from`. It must not credit user balance until the ledger returns
  `#Ok(txIndex)`.
- Ledger removal must check there is no in-flight deposit for that ledger.
- Any reject or error after a withdrawal has been moved to pending must restore
  the pending amount before returning.

Expected error:

```motoko
#withdrawInProgress
```

## Balance Spend Guards

All user-spending paths must prove they cannot spend a balance the caller does
not own. These guards live in `Dex.sr9`, because that is where `BalanceBook`,
`PoolRegistry`, and fee accounting are composed.

Required guards:

```text
withdraw pre-await pending step
  requires amount > 0
  debitKey = AssetKey.ledger(ledger)
  debitAmount = amount + fee
```

- If `BalanceBook.get(balances, user, debitKey) < debitAmount`, return
  `#err(#insufficientLocalBalance)`.
- On this failure, balances, pending withdrawals, and ledger accounting are
  unchanged.
- On success, the user's ledger balance decreases by exactly `debitAmount`, and
  pending withdrawal total for `debitKey` increases by exactly `debitAmount`.

```text
swap(user, ledgerIn, ledgerOut, amountIn, minAmountOut)
  debitKey = AssetKey.ledger(ledgerIn)
```

- If `BalanceBook.get(balances, user, debitKey) < amountIn`, return
  `#err(#insufficientLocalBalance)`.
- On this failure, user balances and pool reserves are unchanged.
- On success, the debit happens before controller-fee credit. If
  `user != controller`, the user's input ledger balance decreases by exactly
  `amountIn`. If `user == controller`, the same account receives the platform
  fee, so the net decrease at `debitKey` is `amountIn - platformFee`.

```text
liquidity(#add)
```

- If the caller lacks either computed `usedA` or computed `usedB`, return
  `#err(#insufficientLocalBalance)`.
- On this failure, user balances, pool reserves, and pool share supply are
  unchanged.

```text
liquidity(#rem)
  shareKey = AssetKey.pool(ledgerA, ledgerB)
```

- If `BalanceBook.get(balances, user, shareKey) < shares`, return
  `#err(#insufficientLocalBalance)`.
- On this failure, user balances, pool reserves, and pool share supply are
  unchanged.
- On success, the user's pool-share balance decreases by exactly `shares`.

## Pools

Pools are keyed by an unordered ledger pair. A pool between `A` and `B` supports
both swap directions:

- `swap(A, B, amountIn, minAmountOut)`
- `swap(B, A, amountIn, minAmountOut)`

Pool state:

```motoko
key : Text
ledgerA : Principal
ledgerB : Principal
reserveA : Nat
reserveB : Nat
totalShares : Nat
lockedShares : Nat
```

The public `pools()` query returns all pools with enough information for clients
to choose routes and build liquidity requests:

```motoko
public type PoolInfo = {
  id : Nat;
  key : Text;
  ledgerA : Principal;
  ledgerB : Principal;
  reserveA : Nat;
  reserveB : Nat;
  totalShares : Nat;
  lockedShares : Nat;
}
```

`pools()` is global pool state. User LP positions are not returned by `pools()`;
they appear in `balances(user)` under the pool's virtual ledger key.

Pool requirements:

- `ledgerA != ledgerB`
- both ledgers are active when the pool is created
- there is at most one pool for the unordered pair
- the pool key is the virtual ledger key used for LP-share balances
- empty pool health: `reserveA == 0`, `reserveB == 0`, `totalShares == 0`, and
  `lockedShares == 0`
- live pool health: `totalShares > 0 ==> reserveA > 0 and reserveB > 0`
- no half-empty pool: `reserveA == 0 <==> reserveB == 0`, and both imply
  `totalShares == 0` and `lockedShares == 0`

`createPool(ledgerA, ledgerB)`:

1. Requires `caller == controller`.
2. Requires `ledgerA != ledgerB`.
3. Requires both ledgers are active.
4. Requires the unordered pool does not already exist.
5. Creates the pool with `reserveA = 0`, `reserveB = 0`, `totalShares = 0`, and
   `lockedShares = 0`.

The pool itself should be direction-agnostic. It can expose internal helpers for
`quoteExactIn` and `swapExactIn` that choose reserves based on `ledgerIn` and
`ledgerOut`.

`removePool(ledgerA, ledgerB)`:

1. Requires `caller == controller`.
2. Requires `ledgerA != ledgerB`.
3. Requires the unordered pool exists.
4. Freezes that pool for the duration of the local transition. The function is
   local-only and must not `await`.
5. If `totalShares == 0`, requires both reserves and `lockedShares` are zero and
   removes the empty pool.
6. If `totalShares > 0`, converts every positive LP-share balance at
   `AssetKey.pool(ledgerA, ledgerB)` into local balances of `ledgerA` and
   `ledgerB`, burns every LP-share balance, settles the protocol-owned locked
   share claim to the controller's local balances, sets reserves, `totalShares`,
   and `lockedShares` to zero, and removes the pool.

Pool removal settlement uses a deterministic holder list from
`BalanceBook.holders(poolKey)`. It must not let the controller choose who
receives rounding leftovers. The settlement should process holders in that
deterministic order, using remaining reserves and remaining shares:

```text
remainingA = reserveA
remainingB = reserveB
remainingShares = totalShares

for each holder with shares > 0:
  if holder is last user holder and lockedShares == 0:
    amountA = remainingA
    amountB = remainingB
  else:
    amountA = shares * remainingA / remainingShares
    amountB = shares * remainingB / remainingShares

  debit holder poolKey by shares
  credit holder AssetKey.ledger(ledgerA) by amountA
  credit holder AssetKey.ledger(ledgerB) by amountB
  remainingA -= amountA
  remainingB -= amountB
  remainingShares -= shares

if lockedShares > 0:
  controllerLockedA = remainingA
  controllerLockedB = remainingB
  credit controller AssetKey.ledger(ledgerA) by controllerLockedA
  credit controller AssetKey.ledger(ledgerB) by controllerLockedB
  remainingA = 0
  remainingB = 0
  remainingShares -= lockedShares
```

Accepted pool removal guarantees:

```text
oldReserveA == sum(user settled amountA) + controllerLockedA
oldReserveB == sum(user settled amountB) + controllerLockedB
oldTotalShares == sum(burned user shares) + oldLockedShares
BalanceBook.total(poolKey)' == 0
PoolRegistry.reserveTotal(ledgerA)' == old(PoolRegistry.reserveTotal(ledgerA)) - oldReserveA
PoolRegistry.reserveTotal(ledgerB)' == old(PoolRegistry.reserveTotal(ledgerB)) - oldReserveB
BalanceBook.total(AssetKey.ledger(ledgerA))' == old(...) + oldReserveA
BalanceBook.total(AssetKey.ledger(ledgerB))' == old(...) + oldReserveB
lockedShares' == 0
pool no longer exists
```

Pool removal preserves the real-ledger accounting invariant: reserves move from
`PoolRegistry.reserveTotal` into user `BalanceBook` local token balances. It
also discharges the LP supply invariant for that pool by burning all user-held
virtual pool-ledger balances and clearing `lockedShares` before deleting the
pool.

## Swap Fee

Every swap charges a 0.3% fee on `amountIn`.

```text
fee = amountIn * 3 / 1000
platformFee = fee * 20 / 100
lpFee = fee - platformFee
effectiveAmountIn = amountIn - fee
```

Integer division rounds down. This intentionally favors LPs when the platform
share is too small to represent: for example, if `fee == 1`, then
`platformFee == 0` and `lpFee == 1`.

The math module should prove:

```text
fee <= amountIn
effectiveAmountIn > 0
platformFee <= fee
lpFee <= fee
platformFee + lpFee == fee
effectiveAmountIn + lpFee + platformFee == amountIn
```

The split is:

- 20% of the fee is credited to the controller's local balance.
- 80% of the fee stays in the liquidity pool for LPs.

Accounting:

- The caller must have the full `amountIn` before the swap starts.
- The swap debits the caller by the full `amountIn`, then credits the controller
  platform fee. If the caller is the controller, the net input-ledger balance
  decrease is `amountIn - platformFee`.
- The quote/output formula uses `effectiveAmountIn`.
- The pool input reserve increases by `effectiveAmountIn + lpFee`.
- The platform fee is credited to the controller's local account for `ledgerIn`.
- The pool output reserve decreases by `amountOut`.

Because `lpFee` stays in reserves while output is priced from
`effectiveAmountIn`, LPs receive their share through the pool reserve increase
instead of separate LP-share minting.

For small `amountIn`, integer division can make `fee == 0`; that is acceptable
for v1 unless we later add a minimum swap fee.

The fee accounting is local:

- `BalanceBook.credit(balances, controller, AssetKey.ledger(ledgerIn), platformFee)`
- LP fee is not a separate balance; it is included in the pool input reserve.
- The controller receives the fee in the same atomic local swap transition that
  debits the user and updates the pool. There is no separate platform-fee pot;
  the controller can use the normal `balances(controller)` and `withdraw` paths.

## Quote

`quote(ledgerIn, ledgerOut, amountIn, minAmountOut)`:

1. Requires `amountIn > 0`.
2. Requires `ledgerIn != ledgerOut`.
3. Requires both ledgers are active.
4. Requires a pool exists for the pair.
5. Requires the pool is live (`totalShares > 0`, `reserveIn > 0`,
   `reserveOut > 0`); otherwise return `#err(#insufficientLiquidity)`.
6. Computes the current constant-product output for the requested direction.
   The output is computed from `effectiveAmountIn = amountIn - fee`, where
   `fee = amountIn * 3 / 1000`.
   The exact formula is:

   ```text
   amountOut = reserveOut * effectiveAmountIn / (reserveIn + effectiveAmountIn)
   ```

7. Returns a receipt with:
   - `ledgerIn`
   - `ledgerOut`
   - `amountIn`
   - `fee`
   - `platformFee`
   - `lpFee`
   - `effectiveAmountIn`
   - `amountOut`
   - `minAmountOut`
   - current reserves used for the quote
   - `ok = amountOut >= minAmountOut`

Quotes are advisory. The pool can move before `swap` runs. Callers who want the
quoted output as their minimum should call `swap(..., minAmountOut = quote.amountOut)`.
The formal guarantee is not that a later swap receives the old quote. The
guarantee is that `quote` and `swap` use the same formula, and `swap` returns the
exact output for the pool snapshot it executes against. Internally, the
plan/apply boundary rejects a swap plan if the pool reserves no longer match the
reserve snapshot used to create that plan.

## Swap

`swap(ledgerIn, ledgerOut, amountIn, minAmountOut)`:

1. Requires `amountIn > 0`.
2. Requires `ledgerIn != ledgerOut`.
3. Requires both ledgers are active.
4. Requires a pool exists for the unordered pair.
5. Requires the pool is live (`totalShares > 0`, `reserveIn > 0`,
   `reserveOut > 0`); otherwise return `#err(#insufficientLiquidity)`.
6. Requires `caller` has at least `amountIn` local balance for `ledgerIn`.
7. If the caller does not have that balance, return
   `#err(#insufficientLocalBalance)` and do not change state.
8. Computes `fee`, `platformFee`, `lpFee`, and `effectiveAmountIn`.
9. Recomputes output from current reserves using `effectiveAmountIn`.
10. If `amountOut < minAmountOut`, return `#err(#slippage)` and do not change
   state.
11. Otherwise:
   - debit caller local `AssetKey.ledger(ledgerIn)` by `amountIn`
   - credit caller local `AssetKey.ledger(ledgerOut)` by `amountOut`
   - increase the pool input reserve by `effectiveAmountIn + lpFee`
   - decrease the pool output reserve by `amountOut`
   - credit the controller local `AssetKey.ledger(ledgerIn)` balance by
     `platformFee`

Swap is fully local and should not `await`. It should be atomic: on failure,
balances and reserves are unchanged.

Accepted swap receipt guarantees:

```text
platformFee + lpFee == fee
effectiveAmountIn + platformFee + lpFee == amountIn
amountOut == AmmMath.quoteExactIn(oldReserveIn, oldReserveOut, effectiveAmountIn)
amountOut >= minAmountOut
amountOut < oldReserveOut
newReserveIn == oldReserveIn + effectiveAmountIn + lpFee
newReserveOut == oldReserveOut - amountOut
receipt.reserveInAfter == receipt.reserveInBefore + effectiveAmountIn + lpFee
receipt.reserveOutAfter + amountOut == receipt.reserveOutBefore
newReserveOut > 0
oldReserveIn * oldReserveOut <= newReserveIn * newReserveOut
```

Caller balance delta is conditional because the controller receives platform
fees in the same balance book:

```text
caller != controller ==>
  userInputBalance' == old(userInputBalance) - amountIn

caller == controller ==>
  userInputBalance' == old(userInputBalance) - amountIn + platformFee
```

## Liquidity

Liquidity uses one public function with an operation variant:

```motoko
public type LiquidityRequest = {
  #add : {
    ledgerA : Principal;
    ledgerB : Principal;
    maxAmountA : Nat;
    maxAmountB : Nat;
    minShares : Nat;
  };
  #rem : {
    ledgerA : Principal;
    ledgerB : Principal;
    shares : Nat;
    minAmountA : Nat;
    minAmountB : Nat;
  }
};

public type LiquidityReceipt = {
  #added : AddLiquidityReceipt;
  #removed : RemoveLiquidityReceipt;
}
```

Both variants are local-only and should not `await`.

### Add Liquidity

`liquidity(#add { ledgerA; ledgerB; maxAmountA; maxAmountB; minShares })`:

1. Requires both max amounts are positive.
2. Requires `ledgerA != ledgerB`.
3. Requires both ledgers are active.
4. Requires a pool exists for the unordered pair.
5. Uses only caller local balances.
6. Treats the inputs as maximum amounts, not exact amounts.
7. Treats `minShares` as LP-share slippage protection. If the computed shares
   credited to the caller are below `minShares`, return `#err(#slippage)` and
   leave balances, reserves, and share supply unchanged.

For an empty pool:

- The first provider sets the initial price.
- Use all available requested amounts: `usedA = maxAmountA`, `usedB = maxAmountB`.
- Use constant-product LP share math:

  ```text
  grossShares = sqrt(usedA * usedB)
  lockedShares = MINIMUM_LIQUIDITY
  mintedShares = grossShares - lockedShares
  ```

- Use the core Nat multiplication/square-root axioms to prove the share bounds.
- The operation applies only if `grossShares > MINIMUM_LIQUIDITY`, so the caller
  receives a positive LP position after the lock.
- The operation also requires `mintedShares >= minShares`.
- Credit `mintedShares` to
  `BalanceBook[caller][AssetKey.pool(ledgerA, ledgerB)]`.
- Store `lockedShares` in the pool. Locked shares are included in
  `totalShares`, but are not spendable by any user.

For a non-empty pool:

```text
candidateB = maxAmountA * reserveB / reserveA
if candidateB <= maxAmountB:
  usedA = maxAmountA
  usedB = candidateB
else:
  usedB = maxAmountB
  usedA = maxAmountB * reserveA / reserveB
```

Then:

```text
mintedShares = min(
  usedA * totalShares / reserveA,
  usedB * totalShares / reserveB
)
```

The operation applies only if:

- `usedA > 0`
- `usedB > 0`
- `mintedShares > 0`
- `mintedShares >= minShares`
- caller has enough local balances for `usedA` and `usedB`

If the caller lacks either local balance, return
`#err(#insufficientLocalBalance)` and leave balances, reserves, and share supply
unchanged.

If the computed `usedA`, `usedB`, or `mintedShares` is zero, return
`#err(#insufficientLiquidity)` and leave balances, reserves, and share supply
unchanged. An `#ok(#added receipt)` always means state was actually changed.

If `mintedShares < minShares`, return `#err(#slippage)` and leave balances,
reserves, and share supply unchanged.

On success:

- debit caller local `AssetKey.ledger(ledgerA)` by `usedA`
- debit caller local `AssetKey.ledger(ledgerB)` by `usedB`
- credit caller local `AssetKey.pool(ledgerA, ledgerB)` by `mintedShares`
- increase pool reserves by `usedA` and `usedB`
- increase pool `totalShares` by `mintedShares + lockedSharesAdded`, where
  `lockedSharesAdded == MINIMUM_LIQUIDITY` for the first add and `0` otherwise

Receipt:

```motoko
{
  usedA : Nat;
  usedB : Nat;
  leftoverA : Nat; // maxAmountA - usedA
  leftoverB : Nat; // maxAmountB - usedB
  shares : Nat;
  lockedShares : Nat; // non-zero only for the first add
}
```

For a non-empty pool, the verifier should use multiplication-shaped
postconditions instead of relying only on division equalities:

```text
mintedShares * old(reserveA) <= usedA * old(totalShares)
mintedShares * old(reserveB) <= usedB * old(totalShares)
mintedShares * new(reserveA) <= usedA * new(totalShares)
mintedShares * new(reserveB) <= usedB * new(totalShares)
old(totalShares) * new(reserveA) >= old(reserveA) * new(totalShares)
old(totalShares) * new(reserveB) >= old(reserveB) * new(totalShares)
```

These are the no-overmint and no-dilution forms that survive integer rounding:
new shares cannot claim more of either reserve than the amounts just added, and
old shares are not diluted by a rounded-up mint.

Returning leftovers matters because the pool may move between a caller's quote
and the liquidity add call. Exact ratios are brittle; max amounts plus leftovers
are the right API.

Initial LP lock:

- `MINIMUM_LIQUIDITY` is a small protocol constant, for example `1` in the
  pool-share unit.
- On the first add, `totalShares` is set to `grossShares =
  sqrt(usedA * usedB)`, but the caller receives only
  `grossShares - MINIMUM_LIQUIDITY`.
- The locked shares stay in `Pool.lockedShares`. They are never spendable by a
  user and are never accepted by `liquidity(#rem ...)`. If the controller later
  removes the pool, the locked-share reserve claim is credited to the
  controller's local balances as protocol-owned cleanup value.
- This protects against a first-LP share-inflation and rounding attack. Without
  a lock, the first LP can initialize a pool with a tiny share supply and a bad
  initial price, then future proportional mints are more exposed to integer
  rounding and can mint too few or even zero shares for small deposits. With a
  locked minimum, the first LP must permanently give up a claim on part of the
  initial reserves, so making the pool's LP share price extreme has a real
  locked-reserve cost.
- `minShares` is the client-side guard for the same class of issue: even if the
  pool moves between planning and execution, an add-liquidity call cannot
  silently accept fewer LP shares than the caller allowed.

### Remove Liquidity

`liquidity(#rem { ledgerA; ledgerB; shares; minAmountA; minAmountB })`:

1. Requires `shares > 0`.
2. Requires `ledgerA != ledgerB`.
3. Requires a pool exists for the unordered pair.
4. Requires both ledgers are listed (`#active` or `#retiring`). Removing
   liquidity is an exit path, so it remains allowed while a ledger is retiring.
5. Requires `totalShares > 0` and caller owns at least `shares` at
   `AssetKey.pool(ledgerA, ledgerB)`.
6. If the caller does not own enough shares, return
   `#err(#insufficientLocalBalance)` and do not change state.
7. Computes:

```text
amountA = shares * reserveA / totalShares
amountB = shares * reserveB / totalShares
```

8. If either output is below the caller's minimum, return `#err(#slippage)` and
   do not change state.
9. Otherwise:
   - debit caller local `AssetKey.pool(ledgerA, ledgerB)` by `shares`
   - decrease pool reserves by `amountA` and `amountB`
   - decrease pool `totalShares` by `shares`
   - credit caller local `AssetKey.ledger(ledgerA)` by `amountA`
   - credit caller local `AssetKey.ledger(ledgerB)` by `amountB`

Remove liquidity is local only and should not `await`.

Accepted remove guarantees:

```text
shares <= old(totalShares)
shares + old(lockedShares) <= old(totalShares)
amountA * old(totalShares) <= shares * old(reserveA)
amountB * old(totalShares) <= shares * old(reserveB)
amountA <= old(reserveA)
amountB <= old(reserveB)
totalShares' == old(totalShares) - shares
```

The first two inequality forms make the rounding direction explicit: burning LP
shares can round outputs down, but must never round them above the proportional
reserve claim.

## Errors

Do not trap for expected failures. Return `#err(error)`.

Each actor func should have its own error type. Avoid one large shared
`DexError`, because it weakens clients: a caller of `quote` should not have to
handle withdrawal reentrancy or ledger-transfer failures.

Suggested error variants:

```motoko
public type LedgerReject = {
  message : Text;
}

public type DepositReceipt = {
  ledger : Principal;
  amount : Nat;
  txIndex : Nat;
  balanceKey : Text;
}

public type WithdrawReceipt = {
  ledger : Principal;
  amount : Nat;
  fee : Nat;
  debitAmount : Nat;
  txIndex : Nat;
  balanceKey : Text;
}

public type RemovePoolReceipt = {
  key : Text;
  ledgerA : Principal;
  ledgerB : Principal;
  settledUsers : Nat;
  burnedUserShares : Nat;
  burnedLockedShares : Nat;
  returnedA : Nat;
  returnedB : Nat;
  controllerLockedA : Nat;
  controllerLockedB : Nat;
}

public type ReturnLedgerBalancesReceipt = {
  ledger : Principal;
  returnedUsers : Nat;
  returnedUser : ?Principal;
  localBalance : Nat;
  fee : Nat;
  returnedAmount : Nat;
  txIndex : ?Nat;
  remainingLocalBalance : Nat;
}

public type DepositError = {
  #ledgerNotActive : Principal;
  #zeroAmount;
  #ledgerTransferFromErr : ICRCLedger.TransferFromError;
  #ledgerTransferFromRejected : LedgerReject;
}

public type WithdrawError = {
  #ledgerNotWhitelisted : Principal;
  #zeroAmount;
  #withdrawInProgress;
  #insufficientLocalBalance;
  #ledgerTransferErr : ICRCLedger.TransferError;
  #ledgerTransferRejected : LedgerReject;
}

public type QuoteError = {
  #ledgerNotActive : Principal;
  #sameLedger;
  #poolNotFound;
  #zeroAmount;
  #insufficientLiquidity;
}

public type SwapError = {
  #ledgerNotActive : Principal;
  #sameLedger;
  #poolNotFound;
  #zeroAmount;
  #insufficientLocalBalance;
  #insufficientLiquidity;
  #slippage;
}

public type LiquidityError = {
  #ledgerNotActive : Principal;
  #ledgerNotWhitelisted : Principal;
  #sameLedger;
  #poolNotFound;
  #zeroAmount;
  #insufficientLocalBalance;
  #insufficientLiquidity;
  #slippage;
}

public type CreatePoolError = {
  #notController;
  #ledgerNotActive : Principal;
  #sameLedger;
  #poolAlreadyExists;
}

public type RemovePoolError = {
  #notController;
  #sameLedger;
  #poolNotFound;
}

public type ReturnLedgerBalancesError = {
  #notController;
  #ledgerNotWhitelisted : Principal;
  #ledgerNotRetiring : Principal;
  #ledgerHasPools : Principal;
  #ledgerHasPendingOps : Principal;
  #returnBalanceDoesNotCoverFee : { balance : Nat; fee : Nat };
  #ledgerTransferErr : ICRCLedger.TransferError;
  #ledgerTransferRejected : LedgerReject;
}

public type ControllerLedgerError = {
  #notController;
  #ledgerAlreadyActive : Principal;
  #ledgerAlreadyRetiring : Principal;
  #ledgerNotWhitelisted : Principal;
  #ledgerNotRetiring : Principal;
  #ledgerHasPools : Principal;
  #ledgerHasLocalBalances : Principal;
  #ledgerHasPendingOps : Principal;
  #ledgerFeeRejected : LedgerReject;
}
```

Ledger transfer errors should preserve the exact core pattern error variants.
`Types.sr9` should import `core/src/pattern/ICRCLedger.sr9` and use
`ICRCLedger.TransferFromError` and `ICRCLedger.TransferError` in the public DEX
errors. Remote rejects are separate from ledger `#Err(...)` responses because
there is no ledger error payload when the call itself fails.

`balances(user)` should return `[]` for a user with no local balances. `pools()`
should return `[]` when no pools exist. They do not return result variants
because empty snapshots are normal payloads and there are no expected errors.

## Accounting Invariants

The useful invariant needs to account for awaited withdrawals. After
`withdraw` debits local balance and before the ledger response returns, the actor
state is visible and reentrant. During that window the debit is not lost; it is a
pending withdrawal.

Use these terms for a real ledger:

```text
ledgerKey(ledger) = AssetKey.ledger(ledger)

settledLedgerNet(ledger)
  = ledgerInflow[ledger] - ledgerOutflow[ledger]

localObligation(ledger)
  = BalanceBook.total(balances, ledgerKey(ledger))
  + PoolRegistry.reserveTotal(pools, ledger)

pendingOut(ledger)
  = PendingWithdrawals.total(pendingWithdrawals, ledgerKey(ledger))
  + PendingReturns.total(pendingReturns, ledgerKey(ledger))
```

Core reserve invariant:

```text
settledLedgerNet(ledger) == localObligation(ledger) + pendingOut(ledger)
```

This is the local proof that all settled tokens recorded as entering the canister
are accounted for exactly as local balances, pool reserves, or in-flight
outgoing transfers. Controller fee balances are ordinary local balances and are
already included in `BalanceBook.total`.

Operation effects:

- Successful deposit increases `settledLedgerNet` and `localObligation` by
  `amount`. Ledger removal cannot happen while the deposit is in flight because
  the in-flight deposit guard blocks `controller_ledger(#rem ledger)`.
- Moving a withdraw to pending decreases `localObligation` by `amount + fee` and
  increases `pendingOut` by `amount + fee`.
- Resolving a pending withdraw as sent decreases `settledLedgerNet` by
  `amount + fee` and clears the matching pending amount.
- Resolving a pending withdraw as failed refunds the local balance and clears the
  matching pending amount.
- Swaps, add liquidity, and remove liquidity preserve `localObligation` for
  every real ledger because they do not call external ledgers.
- Removing a pool preserves `localObligation` for both pool ledgers because it
  moves the pool reserves into user local ledger balances while burning the LP
  share balances.
- A successful forced return from `returnLedgerBalances` decreases
  `settledLedgerNet` and `localObligation` by exactly the processed user's old
  `localBalance`, where `localBalance == returnedAmount + fee`.
- A failed forced return restores the exact user local balance before returning.
- Ledger calls are isolated to the actor branches for `deposit`, `withdraw`,
  `controller_ledger(#add)`, and the controller-only `returnLedgerBalances`
  cleanup path.

Ledger lifecycle invariant:

```text
ledger status == #absent ==>
  BalanceBook.total(balances, ledgerKey) == 0
  PoolRegistry.reserveTotal(pools, ledger) == 0
  PendingWithdrawals.total(pendingWithdrawals, ledgerKey) == 0
  PendingReturns.total(pendingReturns, ledgerKey) == 0
  InFlightDeposits.count(inFlightDeposits, ledgerKey) == 0
  LedgerSet.cachedFee(ledgers, ledger) == null
  no pool in PoolRegistry contains ledger
```

Final removal of a retiring ledger must preserve the accounting invariant and is
allowed only when the invariant above is already true. If any pool contains the
ledger, the controller must remove the pool first; pool removal converts LP
shares into local token balances. If any local token balance remains, users must
withdraw or the controller must run `returnLedgerBalances` before removal.

Other guarantees to prove:

- User local balances never underflow.
- No expected error path traps.
- Every failure path has an unchanged-state postcondition for the modules it
  touched. Failed withdrawals are the exception only while they are resolving:
  they must restore the exact pending debit before returning.
- Failed withdraw pre-await pending step for insufficient local balance leaves
  balances, pending withdrawals, and ledger accounting unchanged.
- Failed `swap` for insufficient input balance leaves balances and pool reserves
  unchanged.
- Failed `liquidity(#add ...)` for insufficient token balances leaves balances,
  pool reserves, and pool share supply unchanged.
- Failed `liquidity(#rem ...)` for insufficient pool shares leaves balances,
  pool reserves, and pool share supply unchanged.
- Real ledger balances and pool LP positions use the same `BalanceBook`.
- Pool LP positions are balances under `AssetKey.pool(ledgerA, ledgerB)`.
- Pool reserves never underflow.
- Every accepted swap requires the caller to have the full `amountIn` before
  mutation and debits that amount before any controller-fee credit.
- Every accepted swap credits 20% of the 0.3% swap fee to the controller's local
  input-ledger balance and leaves the remaining 80% in the input-side pool
  reserve.
- Swaps preserve the constant-product shape by using the same formula for quote
  and execution, and accepted swaps do not decrease `reserveA * reserveB`.
- Accepted swaps satisfy `amountOut >= minAmountOut`.
- Failed swaps do not change user balances or pool reserves.
- `liquidity(#add ...)` mints shares proportional to the current pool reserves
  and credits them to the caller's pool-key balance.
- Failed `#add` liquidity calls do not change user balances, reserves, or shares.
- `liquidity(#rem ...)` debits the caller's pool-key balance and returns the
  proportional reserve claim.
- Failed `#rem` liquidity calls do not change user balances, reserves, or shares.
- `removePool` burns every user-held LP share for that pool, settles the
  locked-share claim to the controller, and credits the exact old reserves back
  into local ledger balances.
- Failed `controller_ledger(#rem ...)` for live pools, local balances, or pending
  operations leaves the ledger set unchanged.

For ledger backing, the observable operational invariant is:

```text
actor_on_ledger_balance(ledger)
  >= localObligation(ledger)
```

When there are no pending outgoing transfers for a ledger, this should tighten to
`actor_on_ledger_balance(ledger) >= settledLedgerNet(ledger)`. The equality
between real ledger state and local accounting depends on external ledger
correctness, so it cannot be fully proven from local state alone. Integration
tests should check that real `icrc1_balance_of(this)` matches or exceeds the
settled local accounting when no withdrawal or forced return is in flight.

## LP Share Guarantees

User-held pool shares are virtual ledger balances under
`AssetKey.pool(ledgerA, ledgerB)`. `totalShares` is the total pool-share supply,
including user-held virtual balances plus protocol-locked initial liquidity.

Required invariants per pool:

```text
totalShares == BalanceBook.total(balances, AssetKey.pool(ledgerA, ledgerB)) + lockedShares
totalShares == 0 <==> reserveA == 0 and reserveB == 0
totalShares > 0 ==> reserveA > 0 and reserveB > 0
lockedShares > 0 ==> totalShares > BalanceBook.total(balances, AssetKey.pool(ledgerA, ledgerB))
```

For an empty pool:

```text
old(totalShares) == 0
accepted add ==>
  grossShares == sqrt(usedA * usedB)
  grossShares > MINIMUM_LIQUIDITY
  lockedShares' == MINIMUM_LIQUIDITY
  mintedShares == grossShares - MINIMUM_LIQUIDITY
  mintedShares > 0
  mintedShares >= minShares
  totalShares' == grossShares
  reserveA' == usedA
  reserveB' == usedB
  userPoolShares' == old(userPoolShares) + mintedShares
```

For a non-empty pool:

```text
accepted add ==>
  mintedShares > 0
  mintedShares >= minShares
  mintedShares <= usedA * old(totalShares) / old(reserveA)
  mintedShares <= usedB * old(totalShares) / old(reserveB)
  totalShares' == old(totalShares) + mintedShares
  lockedShares' == old(lockedShares)
  reserveA' == old(reserveA) + usedA
  reserveB' == old(reserveB) + usedB
  userPoolShares' == old(userPoolShares) + mintedShares
  mintedShares * old(reserveA) <= usedA * old(totalShares)
  mintedShares * old(reserveB) <= usedB * old(totalShares)
```

If the add-liquidity path chooses `usedA` and `usedB` by the pool ratio, we should
prove the stronger equality where division permits it:

```text
mintedShares == usedA * old(totalShares) / old(reserveA)
mintedShares == usedB * old(totalShares) / old(reserveB)
```

For remove liquidity:

```text
accepted rem ==>
  amountA == shares * old(reserveA) / old(totalShares)
  amountB == shares * old(reserveB) / old(totalShares)
  shares + old(lockedShares) <= old(totalShares)
  amountA * old(totalShares) <= shares * old(reserveA)
  amountB * old(totalShares) <= shares * old(reserveB)
  totalShares' == old(totalShares) - shares
  lockedShares' == old(lockedShares)
  reserveA' == old(reserveA) - amountA
  reserveB' == old(reserveB) - amountB
  userPoolShares' == old(userPoolShares) - shares
```

Failed `#add` and `#rem` calls must leave `totalShares`, user pool-key balances,
and reserves unchanged.

These guarantees are the useful client-facing LP proof: a user can only receive
new virtual pool-ledger balance by adding proportional reserves, and burning that
virtual balance returns the proportional claim on reserves.

Controller pool removal is a bulk burn of all remaining LP shares. It must prove:

```text
accepted removePool ==>
  sum(user burned poolKey shares) == old(BalanceBook.total(poolKey))
  sum(user burned poolKey shares) + old(lockedShares) == old(totalShares)
  sum(user credited ledgerA) + controllerLockedA == old(reserveA)
  sum(user credited ledgerB) + controllerLockedB == old(reserveB)
  BalanceBook.total(poolKey)' == 0
  pool no longer exists
```

So LP holders cannot be deleted with the pool; their virtual pool-ledger balances
are converted into local token balances first.

## Deposit/Withdraw Round-Trip Observer

Deposit and withdraw are excluded from the local AMM closed-loop observers
because they touch an external ledger. They still need a separate observer for
the basic user safety property: depositing and then withdrawing cannot produce
more of the same token.

The observer should model only successful ledger calls and then use the same
local withdrawal state machine as the actor:

```motoko
observe_depositWithdrawNoProfit(
  dex : Dex,
  user : Principal,
  ledger : Principal,
  depositAmount : Nat,
  withdrawFee : Nat
) : ()
```

Setup:

1. `ledger` is active for the modeled deposit. It may be active or retiring for
   the modeled withdrawal.
2. `depositAmount > 0`.
3. `beforeLocal = BalanceBook.get(balances, user, AssetKey.ledger(ledger))`.
4. The modeled `icrc2_transfer_from` succeeds for `depositAmount`.
5. `Dex.deposit(user, ledger, depositAmount)` runs.
6. The modeled cached ledger fee is `withdrawFee`.
7. The observer chooses a successful withdrawal amount `withdrawAmount`.
8. The modeled public `withdraw` reaches the pre-await pending state for
   `withdrawAmount` and `withdrawFee`.
9. The modeled `icrc1_transfer` succeeds.
10. The same modeled `withdraw` resumes, records the successful outflow, and
    clears pending.
11. `afterLocal = BalanceBook.get(balances, user, AssetKey.ledger(ledger))`.

Property:

```text
successful round trip ==>
  withdrawAmount + withdrawFee + afterLocal == depositAmount + beforeLocal

successful round trip and afterLocal >= beforeLocal ==>
  withdrawAmount + withdrawFee <= depositAmount

successful round trip and afterLocal >= beforeLocal ==>
  withdrawAmount <= depositAmount
```

For a closed round trip, where the user's local balance for that ledger ends
where it started, the stronger property should hold:

```text
afterLocal == beforeLocal
successful round trip ==>
  withdrawAmount + withdrawFee == depositAmount
  withdrawAmount == depositAmount - withdrawFee
```

So the user does not get more tokens back from the DEX than they deposited; the
closed round trip is missing exactly one withdrawal ledger fee in the DEX-local
model. If `afterLocal < beforeLocal`, the extra withdrawn amount came from the
user's pre-existing local balance, not from profit.
If the ICRC ledger also charges the user a fee for the `transfer_from` deposit,
the user's external wallet loss is larger. That deposit-side fee is enforced by
the ledger, not by DEX local accounting, so this observer should state it as an
assumption or model parameter rather than try to prove it from DEX state.

Add a separate failed-withdraw observer:

```motoko
observe_failedWithdrawRefundsExactPendingDebit(...)
```

Property:

```text
withdraw pre-await pending step succeeds
the same withdraw resumes with a failed transfer or reject ==>
  userLedgerBalance' == old(userLedgerBalance)
  PendingWithdrawals.total' == old(PendingWithdrawals.total)
  LedgerAccounting.net' == old(LedgerAccounting.net)
```

This is the reentrancy safety property for ledger errors and call rejects: once
the actor debits a pending withdrawal, every failed external outcome returns the
exact `amount + fee` to the user before the public call returns.

## Verification Observers

We should add verification-only observers for closed-loop attacks. These are not
actor methods; they are pure/ghost harnesses that call the same internal paths as
the public user funcs.

Observed user actions:

- `swap`
- `liquidity(#add ...)`
- `liquidity(#rem ...)`

Excluded actions:

- `deposit`
- `withdraw`
- `controller_ledger`
- `removePool`
- `returnLedgerBalances`

Those excluded funcs touch external ledger/controller state and are not part of
a local AMM loop. Deposit and withdraw are covered separately by the round-trip
observer above.

### Closed Loop Definition

A closed loop starts from a snapshot:

```text
beforeBalances = balances(attacker)
beforePools = pools()
```

The public-user attack observer should assume `attacker != controller`. The
controller receives platform fees by design, so controller behavior belongs in
separate privileged-role observers.

Then it runs any bounded sequence of observed user actions. Keep two closure
predicates:

```text
userClosed(attacker, target)
systemClosed(attacker, target)
```

`userClosed` for a target real ledger key `target = AssetKey.ledger(token)` means
every other attacker balance is restored:

```text
forall key.
  key != target ==> afterBalances[key] == beforeBalances[key]
```

This includes pool virtual-ledger keys like `pool:principal1:principal2`, so an
attacker cannot hide a changed LP-share quantity while claiming the loop is
closed.

`systemClosed` adds pool-state restoration:

```text
userClosed(attacker, target)
and afterPools == beforePools
```

The first no-profit observer should use `systemClosed`, because otherwise value
can be hidden in changed pool reserves while the LP-share quantity is unchanged.
Separate single-pool observers may use `userClosed`, but they must either assume
the attacker starts with no LP shares for the touched pool or include the
attacker's proportional LP reserve claim in the value metric.

The observer must prove:

```text
systemClosed(attacker, target, before, after)
  ==> afterBalances[target] <= beforeBalances[target]
```

This is the precise "attacker comes in with one token and cannot leave with more
of that same token" property. If the attacker ends with more of token `A` but
less of token `B` or fewer pool shares, the loop is not closed; it is a portfolio
change, not a same-asset profit proof.

### Bounded Harnesses

Universal "any length in any combination" is usually too broad for direct
verification, so we should build bounded observers and increase depth as the
modules stabilize:

```motoko
observe_noProfit_1(...)
observe_noProfit_2(...)
observe_noProfit_3(...)
observe_noProfit_4(...)
```

Each observer takes an attacker principal, a target ledger, an initial DEX state,
and a symbolic action list of that length. It executes only successful local
actions and then checks the closed-loop implication.

Important cases to cover first:

- `swap(A,B)` then `swap(B,A)`
- `liquidity(#add)` then `liquidity(#rem)`
- `swap`, `add`, `rem`
- `add`, `swap`, `rem`

For the first two single-pool cases, also add direct `userClosed` observers that
do not require pool restoration but prove the target balance does not increase.
Those observers should carry the extra assumptions listed above about initial LP
shares or LP reserve-claim value.

### Value Metric

The first observer is same-asset only: start and end in the same real ledger key.
That is the strongest unambiguous property for "one token in, more of same token
out".

For v1, attack observers are same-pool only. Do not claim unconditional
no-profit across arbitrary multiple pools; that claim is false for a real AMM if
pools start mispriced, because normal arbitrage can turn `A -> B -> C -> A` into
more `A`. Cross-pool proof work is explicitly out of scope until we introduce an
external price certificate or another no-arbitrage precondition.

## Module Architecture

Split the implementation by proof boundary, not only by data shape. Each module
should own one opaque state type, expose a small ghost model/summary, and give
callers exact postconditions for the state it changes. `Dex.sr9` should compose
those summaries; it should not reach into raw maps.

Mutable storage should use `mo:core/mutable/MBMap` behind opaque types. No public
module API should expose an `MBMap` handle.

Planned files:

```text
playground/invar/dex2/
  spec.md
  DexActorDemo.sr9
  lib/
    Types.sr9
    AssetKey.sr9
    AssetTotals.sr9
    BalanceBook.sr9
    LedgerSet.sr9
    PendingWithdrawals.sr9
    PendingReturns.sr9
    InFlightDeposits.sr9
    LedgerAccounting.sr9
    AmmMath.sr9
    Pool.sr9
    PoolRegistry.sr9
    Dex.sr9
  proofs/
    InvariantObservers.sr9
    LedgerRoundTripObservers.sr9
    AttackObservers.sr9
```

`lib/` is for production DEX modules imported by the actor. `proofs/` is for
verification-only observers and harnesses; actor code should not import from it.

`Types.sr9` contains public request, receipt, and error variants. It has no
state and no proof burden beyond keeping the actor API and internal modules on
the same types.

`AssetKey.sr9` contains the canonical key constructors. It should prove:

```text
AssetKey.pool(a, b) == AssetKey.pool(b, a)
AssetKey.ledger(x) != AssetKey.pool(a, b)
```

`AssetTotals.sr9` is a reusable opaque `Text -> Nat` map for summary totals.
It should expose `get`, `credit`, and `debit`, with exact delta ensures. This is
used anywhere we need a proof-friendly per-asset total instead of quantifying
through a nested map.

`BalanceBook.sr9` owns:

```text
balances  : recordKey(user, assetKey) -> Nat
totals    : assetKey -> Nat
holderLog : append-only scan log for listing/settlement
```

It is the only module that mutates user balances. The flat storage replaces the
older nested `Principal -> UserBalances` design because the active proof lane is
more stable when the user and asset are encoded into one balance key. Its key
proof obligation is:

```text
BalanceBook.total(book, key)
  == sum of every user's balance at key
```

Callers should rely on exact deltas:

```text
credit(book, user, key, amount)
  ensures total(key)' == old(total(key)) + amount

debit(book, user, key, amount) == true
  ensures total(key)' == old(total(key)) - amount

debit(book, user, key, amount) == false
  ensures totals and user balances are unchanged
```

It should also expose deterministic `holders(book, key)`. The runtime scans an
append-only holder log and rechecks the authoritative current balance before
returning a holder. The verifier should eventually be able to rely on:

```text
user in holders(key) <==> get(book, user, key) > 0
sum over holders(key) get(book, user, key) == total(key)
```

This gives `removePool` and `returnLedgerBalances` a proof-friendly way to settle
all owners of a virtual pool ledger or real ledger balance.

`LedgerSet.sr9` owns the ledger lifecycle. It should model absent ledgers
separately from listed ledgers:

```text
status(ledger) : { #absent; #active; #retiring }
fee(ledger) : ?Nat
```

It should provide `add(ledger, fee)`, `retire`, `rem`, `isActive`, `isListed`,
`cachedFee`, and `refreshFee`, with duplicate/missing results expressed as
errors instead of traps. `add` stores the fee that the actor read from
`icrc1_fee()`. `refreshFee` updates that cached fee when a transfer
returns `#BadFee { expected_fee }`. `rem` removes a retiring ledger only after
the top-level `Dex.sr9` transition has checked there are no pools, local
balances, pending withdrawals, pending forced returns, or in-flight deposits for
that ledger.

`LedgerSet` should prove:

```text
isListed(ledger) <==> cachedFee(ledger) != null
status(ledger) == #absent <==> cachedFee(ledger) == null
status(ledger) == #active ==> isListed(ledger)
status(ledger) == #retiring ==> isListed(ledger)
```

`PendingWithdrawals.sr9` replaces a Bool reentrancy guard. It owns pending
withdrawal records by `(user, ledgerKey)` and an `AssetTotals` summary by ledger
key. Each record stores `{ amount; fee; debitAmount }`, where
`debitAmount == amount + fee`. It should prove no second pending withdrawal can
be opened for the same `(user, ledgerKey)`, and it should expose
`total(pending, ledgerKey)` for the core reserve invariant.

`PendingReturns.sr9` owns controller-forced ledger-return records by
`(user, ledgerKey)`. Each record stores the user's full old local balance, the
fee deducted from that balance, and `returnedAmount + fee == localBalance`. It
exposes `total(pendingReturns, ledgerKey)` so forced returns are included in
`pendingOut(ledger)`. Failed forced returns must restore the user's full old
local balance exactly.

`InFlightDeposits.sr9` owns in-flight deposit counts by ledger key. It does not
track token obligations because no local user balance has been credited yet. Its
proof role is lifecycle safety: `controller_ledger(#rem ledger)` requires
`InFlightDeposits.count(ledgerKey) == 0`.

`LedgerAccounting.sr9` records settled external movement only:

```text
inflow  : ledgerKey -> Nat
outflow : ledgerKey -> Nat
net(ledgerKey) = inflow - outflow
```

It should maintain `inflow >= outflow` and expose exact deltas for
`recordDeposit`, `recordWithdraw`, and `recordForcedReturn`. Pending withdrawals
and forced returns do not belong here until the ledger transfer succeeds.

`DexActorDemo.sr9` owns the async ICRC boundary in the current implementation.
It builds ledger actors with `ICRCLedger.fromPrincipal`, performs remote calls,
catches rejects, and maps ledger `#Ok/#Err` responses through the matching
`Dex` local transition. It must not own independent DEX state or AMM math.
Remote rejects are normal expected outcomes because a standard ledger can be
temporarily offline or out of cycles. Reject handling must always call the
matching local cleanup transition before returning.

The actor await protocol is:

- call the appropriate `Dex.sr9` pre-await local transition;
- perform the ICRC call with `await`;
- on `#Ok(txIndex)`, call the matching `Dex.sr9` success transition;
- for `controllerAddLedger`, the successful remote value is the `Nat` fee from
  `icrc1_fee()`, not a transaction index;
- on ledger `#Err(err)` or remote reject, call the matching `Dex.sr9` failure
  transition before returning;
- on transfer `#BadFee { expected_fee }`, refresh the cached ledger fee before
  returning the error;
- ensure every path clears in-flight/pending state before returning.

This is the target shape for when the verifier supports it cleanly. Until then,
the actor uses the same protocol directly around the await and keeps `Dex.sr9`
as the only owner of local state changes.

`AmmMath.sr9` should be pure math only: fee split, exact-in quote,
constant-product LP initial share minting with `sqrt(usedA * usedB)`,
add-liquidity plan, and remove-liquidity plan. This is where we prove bounds
such as `amountOut < reserveOut` for live pools, `effectiveAmountIn <=
amountIn`, `platformFee + lpFee == fee`, `effectiveAmountIn + lpFee +
platformFee == amountIn`, `grossShares > MINIMUM_LIQUIDITY ==>
grossShares - MINIMUM_LIQUIDITY > 0`, and the multiplication-shaped LP share
inequalities used to avoid rounding mistakes.
It should own the `MINIMUM_LIQUIDITY` constant so pool modules do not duplicate
the lock policy.

`Pool.sr9` owns one opaque pool:

```text
ledgerA : Principal
ledgerB : Principal
reserveA : Nat
reserveB : Nat
totalShares : Nat
lockedShares : Nat
```

It should not know about user balances or controller fees. It should expose
plan/apply style functions:

```text
quoteExactIn(pool, ledgerIn, amountIn, minAmountOut) : QuoteReceipt
planSwap(pool, ledgerIn, amountIn, minAmountOut) : Result<SwapPlan, SwapError>
applySwap(pool, plan)

planAdd(pool, maxAmountA, maxAmountB, minShares) : Result<AddPlan, LiquidityError>
applyAdd(pool, plan)

planRemove(pool, shares, minAmountA, minAmountB) : Result<RemovePlan, LiquidityError>
applyRemove(pool, plan)
```

The plan functions do not mutate. The apply functions require a plan produced
from the current pool snapshot and prove exact reserve/share deltas. This keeps
client-facing guarantees like "swap received what the current quote formula
computed" local to the pool.

`Pool.sr9` also owns pool health:

```text
totalShares == 0 <==> reserveA == 0 and reserveB == 0
totalShares > 0 ==> reserveA > 0 and reserveB > 0
lockedShares <= totalShares
accepted swap ==> old(reserveA * reserveB) <= reserveA' * reserveB'
```

`PoolRegistry.sr9` owns the pool map and aggregate reserve totals:

```text
pools         : poolKey -> Pool
reserveTotals : AssetTotals
```

It should route both directions through the same pool, prevent duplicate pools,
return `PoolInfo` for `pools()`, and expose:

```text
reserveTotal(registry, ledger) : Nat
totalShareSupply(registry, poolKey) : Nat
lockedShareSupply(registry, poolKey) : Nat
```

Every successful pool mutation must update `reserveTotals` with the exact same
delta as the pool reserves. That makes the top-level reserve invariant talk to
one summary function instead of summing all pools.

It should expose `containsLedger(registry, ledger) : Bool` so
`controller_ledger(#rem ledger)` can prove pools are removed first. It should
also expose a pool-removal helper used by `Dex.removePool` after LP holders have
been settled. That helper must prove the removed pool's reserves and
`totalShares`/`lockedShares` have been reduced to zero before deletion.

`Dex.sr9` is the only cross-module state:

```text
controller : Principal
ledgers : LedgerSet
balances : BalanceBook
pools : PoolRegistry
ledgerAccounting : LedgerAccounting
pendingWithdrawals : PendingWithdrawals
pendingReturns : PendingReturns
inFlightDeposits : InFlightDeposits
```

The actor and `Dex.sr9` use the same concrete `controller` principal.
Controller-only calls return `#notController` when `caller != controller`.

It owns the cross-module invariant:

```text
LedgerAccounting.net(ledgerKey)
  == BalanceBook.total(balances, ledgerKey)
   + PoolRegistry.reserveTotal(pools, ledger)
   + PendingWithdrawals.total(pendingWithdrawals, ledgerKey)
   + PendingReturns.total(pendingReturns, ledgerKey)
```

It also owns the LP supply invariant for every pool:

```text
PoolRegistry.totalShareSupply(pools, poolKey)
  == BalanceBook.total(balances, poolKey)
   + PoolRegistry.lockedShareSupply(pools, poolKey)
```

`Dex.sr9` should contain no external ledger calls and no `async*` functions. The
actor exposes the only public user methods: `deposit`, `withdraw`, `quote`,
`swap`, `liquidity`, `balances`, and `pools`. There are no public
pending-withdraw methods.

For `withdraw`, pending is just internal state owned by the single public actor
method. The implementation may factor the pre-await debit/pending step and the
post-await success/failure resolution into private helpers inside `Dex.sr9`, but
those helper names are not part of the spec and are not actor methods.

The local behavior owned by `Dex.sr9` is:

```text
deposit pre-await guard insert/remove
deposit(...)
withdraw pre-await debit and pending insert
withdraw post-await success/failure resolution
forced return pre-await debit and pending insert
forced return post-await success/failure resolution
quote(...)
swap(...)
liquidity(...)
controllerLedger(...)
controllerAddLedger(...)
createPool(...)
removePool(...)
```

`Dex.deposit` is called only after the actor checked that the ledger was active
and inserted an in-flight deposit guard before the external `transfer_from`.
Ledger removal is blocked until that guard is cleared.

Its local transitions must enforce spend guards before mutating dependent state:

- deposit inserts an in-flight deposit guard before `icrc2_transfer_from` and
  removes it on every success, ledger error, or remote reject.
- the withdraw pre-await step checks `amount + fee` against the caller's real
  ledger local balance before creating a pending withdrawal.
- the withdraw failed-transfer/reject resolution returns the pending
  `debitAmount` to the caller's real ledger local balance before returning from
  the same public `withdraw` call.
- forced ledger returns debit the user's full local balance into pending state
  before the external transfer; the fee is deducted from that same balance.
  Failure restores the user's full old balance.
- `removePool` settles all LP holders into local token balances before deleting
  the pool.
- `swap` checks `amountIn` against the caller's input ledger local balance before
  touching the pool or crediting the controller fee.
- `swap` credits `platformFee` directly to the controller's local input-ledger
  balance. Its caller-balance postcondition is conditional when
  `caller == controller`.
- `liquidity(#add)` requires active ledgers and checks the computed token amounts
  against the caller's local token balances before minting shares.
- `liquidity(#rem)` checks `shares` against the caller's pool virtual-ledger
  balance before decreasing pool reserves.
- `createPool` requires active ledgers, not merely listed ledgers.
- `controllerLedger(#retire)` moves an active ledger to retiring so new exposure
  stops while exits remain available.
- `controllerLedger(#rem)` errors if any pool, local balance, or pending ledger
  operation still references the ledger.

The actor stays thin around state: public async endpoints call `Dex.sr9`
pre/post transitions around the ledger await, and local endpoints call
`Dex.sr9` directly. Controller gates are checked in `Dex.sr9` because it owns
the controller principal. When the `async*` verifier limitations are fixed, the
remote-await branching can move into a helper module without changing the local
DEX modules.

`proofs/InvariantObservers.sr9` should call each successful local transition and
each expected failure branch, then prove the cross-module accounting invariant
and LP supply invariant are preserved. This is the first observer suite to
implement, because the attack observers are only meaningful if the basic state
summaries are known to stay coherent.

`proofs/LedgerRoundTripObservers.sr9` should import `lib/Dex.sr9` and prove the
deposit/withdraw round-trip property using `Dex.deposit`,
the withdraw pre-await pending state, and the withdraw post-await success
resolution. It models successful external ledger calls but proves only the local
DEX accounting consequence: the user cannot withdraw more than they deposited,
and withdrawing the maximum leaves them short one withdrawal ledger fee.

`proofs/AttackObservers.sr9` should import `lib/Dex.sr9` and execute bounded
local action sequences against the same `swap` and `liquidity` transitions used
by the actor. It should not duplicate AMM logic. Its public-user observers assume
`attacker != controller`, distinguish `userClosed` from `systemClosed`, and stay
same-pool for v1.
