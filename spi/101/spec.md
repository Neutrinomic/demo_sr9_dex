# SPI-101: Deposit, Withdraw, Balance

SPI-101 standardizes the token edge used by protocol canisters: external ICRC
tokens enter through deposit, protocol logic runs on local balances, and
external ICRC tokens leave through withdraw.

The DEX and DAO demos already use this pattern, but their public APIs are not
the standard. SPI-101 is the target surface they should adapt to.

## IC Call Model

SPI-101 is the base profile for normal actor calls to supported standard ICRC
ledgers.

The IC docs distinguish two inter-canister call modes:

- Unbounded-wait calls are guaranteed-response calls. The caller waits for the
  exact response if the callee responds, or a reject if the call does not
  successfully execute.
- Bounded-wait calls can return `SYS_UNKNOWN`, where the caller cannot know from
  the response whether the callee processed the request.

SPI-101 assumes unbounded-wait actor calls. It does not standardize
bounded-wait retries, operation IDs, or reconciliation. If a protocol chooses
bounded-wait calls to arbitrary ledgers, that should be a separate extension
with explicit idempotency and result-query rules.

This matters for the interface:

- deposit does not need a retry variant;
- withdraw does not need a retry variant;
- ledger `#Err` results are normal ICRC results and can be handled directly;
- call rejections are treated as failed ledger calls under the supported
  standard-ledger assumption;
- implementations still need internal in-flight state around withdraw because
  `await` commits pre-call state and other messages can interleave before the
  callback runs.

SPI-101 implementations must avoid traps in post-await callbacks. A trap after
the ledger response rolls back only the callback message execution, not the
pre-await state that was already committed.

## Interface

The importable SR9 type module is:

```motoko
import SPI101 "mo:spi/101/DepositWithdrawBalance";
```

The actor type has exactly these methods:

```motoko
public type Actor = actor {
  spi_101_deposit : shared (request : DepositRequest) ->
    async Result<DepositReceipt, DepositError>;

  spi_101_withdraw : shared (request : WithdrawRequest) ->
    async Result<WithdrawReceipt, WithdrawError>;

  spi_101_balance : shared query (request : BalanceRequest) ->
    async BalanceReceipt
};
```

`spi_101_balance` does not return a `Result`. A compliant implementation should
always be able to return the known local balances for a subject.

## Shared Types

```motoko
public type Result<Ok, Err> = { #ok : Ok; #err : Err };
public type Subaccount = Blob;
public type Account = ICRCLedger.Account;
public type BalanceKey = Principal;
public type BalanceEntry = (BalanceKey, Nat);
public type LedgerReject = { message : Text };
```

`Account` is the ICRC account shape `{ owner : Principal; subaccount : ?Blob }`.
Subaccounts affect only the external transfer route.

`subject` is the SPI-101 local account whose balances are credited, debited, or
queried. A subject is a `Principal`, but it is not necessarily the same value as
the IC caller. It can be either a direct principal or a SPI-100 delegated account
principal controlled by the caller. Implementations must authorize mutations
with the SPI-100 control rule:

```text
Authorize(caller, subject) = caller controls subject
```

This keeps ICRC account ownership separate from local protocol account
ownership.

`BalanceKey` is the asset key inside a subject's local balance map. Real ICRC
token balances use the ledger principal as the key. Protocol-local assets use
SPI-100 virtual principals as keys. A virtual asset key is not itself proof that
the caller controls a subject.

## Deposit Types

```motoko
public type DepositRequest = {
  subject : Principal;
  ledger : Principal;
  from : Account;
  amount : Nat
};

public type DepositReceipt = {
  ledger : Principal;
  from : Account;
  subject : Principal;
  amount : Nat;
  txIndex : Nat;
  balanceAfter : Nat
};

public type DepositError = {
  #zeroAmount;
  #amountTooLow : { amount : Nat; minAmount : Nat };
  #ledgerNotSupported : Principal;
  #subjectNotAuthorized : { caller : Principal; subject : Principal };
  #sourceOwnerMismatch : { caller : Principal; fromOwner : Principal };
  #ledgerTransferFromErr : ICRCLedger.TransferFromError;
  #ledgerTransferFromRejected : LedgerReject
};
```

## Withdraw Types

```motoko
public type WithdrawRequest = {
  subject : Principal;
  ledger : Principal;
  to : Account;
  amount : Nat
};

public type PendingWithdrawal = {
  subject : Principal;
  ledger : Principal;
  to : Account;
  amount : Nat;
  fee : Nat;
  debitAmount : Nat
};

public type WithdrawReceipt = {
  ledger : Principal;
  to : Account;
  subject : Principal;
  amount : Nat;
  fee : Nat;
  debitAmount : Nat;
  txIndex : Nat;
  balanceAfter : Nat
};

public type WithdrawError = {
  #zeroAmount;
  #ledgerNotSupported : Principal;
  #subjectNotAuthorized : { caller : Principal; subject : Principal };
  #insufficientLocalBalance;
  #withdrawInProgress : PendingWithdrawal;
  #ledgerFeeRejected : LedgerReject;
  #ledgerTransferErr : ICRCLedger.TransferError;
  #ledgerTransferRejected : LedgerReject
};
```

`PendingWithdrawal` is exposed only so a concurrent call can explain why the
subject is temporarily locked. It is not a retry token in SPI-101.

## Balance Types

```motoko
public type BalanceRequest = {
  subject : Principal
};

public type BalanceReceipt = {
  subject : Principal;
  entries : [BalanceEntry]
};
```

The response contains all nonzero local balances visible through SPI-101. Each
principal key appears at most once.

## Deposit Semantics

`spi_101_deposit(request)` pulls ICRC tokens into the protocol canister and
credits the subject's local balance only after `icrc2_transfer_from` returns
`#Ok`.

Required behavior:

- `amount == 0` returns `#zeroAmount`.
- If the protocol has a minimum accepted deposit and `amount` is below it,
  return `#amountTooLow { amount; minAmount }`.
- `ledger` must be a supported external ICRC ledger.
- If `caller` does not control `request.subject` according to SPI-100, return
  `#subjectNotAuthorized { caller; subject = request.subject }`.
- `from.owner` must equal `caller`.
- The credited local subject is `request.subject`.
- The credited local balance key is `ledger`.
- The ledger call is `icrc2_transfer_from` from `request.from` to the protocol
  canister's account.
- `from.subaccount` is passed through unchanged.
- Success credits exactly `amount` and returns a receipt.
- Ledger `#Err` results and call rejections do not credit local balance.

The local deposit credit is exactly `amount`. Any external ICRC fee is paid
according to the ledger's transfer-from rules.

Clients must not blindly retry a deposit if they did not observe the response to
their ingress call. They should query `spi_101_balance` or ledger history first,
or use a future idempotent extension.

## Withdraw Semantics

`spi_101_withdraw(request)` moves local protocol balance back to an external
ICRC account.

Required behavior:

- `amount == 0` returns `#zeroAmount`.
- `ledger` must be a supported external ICRC ledger, not a virtual balance key.
- If `caller` does not control `request.subject` according to SPI-100, return
  `#subjectNotAuthorized { caller; subject = request.subject }`.
- The debited local subject is `request.subject`.
- The debited local balance key is `ledger`.
- The protocol obtains or uses a valid transfer fee for the ledger.
- The subject must have at least `amount + fee` local balance.
- Before awaiting the ledger, the implementation debits `amount + fee` into
  internal in-flight withdrawal state.
- A second overlapping withdraw for that subject returns `#withdrawInProgress`.
- The ledger call is `icrc1_transfer` sending exactly `amount` to `request.to`.
- `to.subaccount` is passed through unchanged.
- Success finalizes the in-flight debit and returns a receipt with
  `debitAmount == amount + fee`.
- A ledger `#Err` result restores the full in-flight debit and returns
  `#ledgerTransferErr`.
- A call rejection restores the full in-flight debit and returns
  `#ledgerTransferRejected`.

The restore-on-rejection rule relies on the SPI-101 supported-standard-ledger
assumption and unbounded-wait calls. Bounded-wait `SYS_UNKNOWN` calls cannot use
this rule safely.

Clients must not blindly retry a withdraw if they did not observe the response
to their ingress call. They should query `spi_101_balance` and the destination
ledger account first, or use a future idempotent extension.

## Balance Semantics

`spi_101_balance` returns the current local balances for `request.subject`.

Required behavior:

- The call is read-only.
- The response subject equals the requested subject.
- Entries contain all nonzero SPI-101 local balances.
- ICRC token balances are keyed by the real ICRC ledger canister principal.
- Protocol-local assets are keyed by SPI-100 virtual principals.
- Implementations must not accept a SPI-100 virtual principal as an external
  ledger for deposit or withdraw.

Example:

```motoko
[
  (tokenA, 1_000_000),
  (tokenB, 400_000),
  (virtualPool0, 22_500)
]
```

## How DEX Should Adapt

The DEX should expose SPI-101 as a stable compatibility layer while keeping its
DEX-specific quote, swap, liquidity, and pool methods.

- Replace `deposit(ledger, amount)` with
  `spi_101_deposit({ subject; ledger; from; amount })`.
- Use `from.owner == caller` and pass `from.subaccount` into
  `icrc2_transfer_from`.
- Replace text balance keys with principal keys.
- Use the real ledger principal for token balances.
- Use SPI-100 virtual principals for pool share balances.
- Replace or alias `balances(user)` with `spi_101_balance({ subject = user })`.
- Replace `withdraw(ledger, amount)` with
  `spi_101_withdraw({ subject; ledger; to; amount })`.
- Pass `to.subaccount` into `icrc1_transfer`.
- Keep the existing internal pre-await debit/restore pattern, but do not expose
  a public retry method in the SPI-101 surface.

## How DAO Should Adapt

The DAO should expose SPI-101 around its governance ledger while keeping stake,
proposal, vote, and config methods DAO-specific.

- `ledger` is still present in SPI-101 requests.
- The governance ledger is the only supported ledger.
- Any other ledger returns `#ledgerNotSupported`.
- Deposits credit the subject's liquid governance-token balance.
- Withdrawals debit the subject's liquid governance-token balance.
- The existing public `retry_withdrawal` method should not be part of the
  SPI-101 surface.
- `spi_101_balance({ subject })` should return the liquid governance-token
  balance under the governance ledger principal when nonzero.
- Active stake, locked proposal stake, pending unstake, voting power, and
  proposals remain DAO-specific views unless the DAO intentionally exposes some
  of them as SPI-100 virtual-principal balances in a later extension.

## Out Of Scope

SPI-101 does not standardize bounded-wait ledger calls. A bounded-wait extension
would need at least:

- client or canister operation IDs;
- `created_at_time` and memo requirements;
- duplicate-result handling;
- a way to query or reconcile operation status;
- explicit rules for `SYS_UNKNOWN`;
- proofs that retries cannot double credit or double debit.

## Verification Targets

Implementations claiming SPI-101 should prove these boundaries:

- unsupported ledgers do not change local balances;
- virtual principals cannot be used as external ledgers;
- callers cannot mutate subjects they do not control;
- deposits below the protocol minimum do not change local balances;
- deposits with `from.owner != caller` do not change local balances;
- failed deposits do not create local credit;
- successful deposits credit exactly `amount` once;
- withdrawals cannot start without enough local balance for `amount + fee`;
- overlapping withdrawals cannot double-spend the same local balance;
- successful withdrawals debit exactly `amount + fee` once;
- failed withdrawals restore exactly the in-flight debit;
- balance results contain no duplicate keys.
