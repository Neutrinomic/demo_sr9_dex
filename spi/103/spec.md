# SPI-103: ICRC Bridge

SPI-103 standardizes the ICRC ledger bridge that moves external ICRC tokens
into and out of a protocol canister's local wallet accounting.

SPI-101 is the wallet view. SPI-103 is the async boundary for ICRC ledgers.
They are intentionally separate because the wallet model is useful for many
asset systems, while ICRC deposit and withdrawal have ledger-specific transfer,
fee, approval, and retry semantics.

## Interface

The importable SR9 type module is:

```motoko
import SPI103 "mo:spi/103/ICRCBridge";
```

The actor type has these methods:

```motoko
public type Actor = actor {
  spi_103_icrc_deposit : shared (request : IcrcDepositRequest) ->
    async Result<IcrcDepositReceipt, IcrcDepositError>;

  spi_103_icrc_withdraw : shared (request : IcrcWithdrawRequest) ->
    async Result<IcrcWithdrawReceipt, IcrcWithdrawError>
};
```

An implementation that exposes these methods should also expose
`spi_101_wallet`, because clients need SPI-101 to observe the local account
state that the bridge mutates.

## Shared Types

```motoko
public type Result<Ok, Err> = { #ok : Ok; #err : Err };
public type LedgerId = SPI101.LedgerId;
public type LedgerReject = { message : Text };
```

`LedgerId` is the principal of a supported ICRC ledger canister.

The wallet node affected by an SPI-103 ICRC request is always:

```motoko
SPI101.externalLedgerNode(request.ledger)
```

Equivalently:

```motoko
#ledger(request.ledger)
```

## Deposit Types

```motoko
public type IcrcDepositRequest = {
  account : SPI100.Account;
  ledger : LedgerId;
  from : ICRC1.Account;
  amount : Nat
};

public type IcrcDepositReceipt = {
  account : SPI100.Account;
  ledger : LedgerId;
  from : ICRC1.Account;
  amount : Nat;
  txIndex : Nat;
  balanceAfter : Nat
};

public type IcrcDepositError = {
  #zeroAmount;
  #amountTooLow : { amount : Nat; minAmount : Nat };
  #ledgerNotSupported : LedgerId;
  #accountNotAuthorized : { caller : Principal; account : SPI100.Account };
  #sourceOwnerMismatch : { caller : Principal; fromOwner : Principal };
  #icrcTransferFromErr : ICRC1.TransferFromError;
  #icrcTransferFromRejected : LedgerReject
};
```

## Withdraw Types

```motoko
public type IcrcWithdrawRequest = {
  account : SPI100.Account;
  ledger : LedgerId;
  to : ICRC1.Account;
  amount : Nat
};

public type PendingIcrcWithdrawal = {
  account : SPI100.Account;
  ledger : LedgerId;
  to : ICRC1.Account;
  amount : Nat;
  fee : Nat;
  debitAmount : Nat
};

public type IcrcWithdrawReceipt = {
  account : SPI100.Account;
  ledger : LedgerId;
  to : ICRC1.Account;
  amount : Nat;
  fee : Nat;
  debitAmount : Nat;
  txIndex : Nat;
  balanceAfter : Nat
};

public type IcrcWithdrawError = {
  #zeroAmount;
  #ledgerNotSupported : LedgerId;
  #accountNotAuthorized : { caller : Principal; account : SPI100.Account };
  #insufficientLocalBalance;
  #withdrawInProgress : PendingIcrcWithdrawal;
  #icrcFeeRejected : LedgerReject;
  #icrcTransferErr : ICRC1.TransferError;
  #icrcTransferRejected : LedgerReject
};
```

`PendingIcrcWithdrawal` is exposed only so a concurrent call can explain why the
account is temporarily locked. It is not a retry token.

## Deposit Semantics

`spi_103_icrc_deposit(request)` pulls ICRC tokens into the protocol canister and
credits the account's SPI-101 wallet only after `icrc2_transfer_from` returns
`#Ok`.

Required behavior:

- `amount == 0` returns `#zeroAmount`.
- If the protocol has a minimum accepted deposit and `amount` is below it,
  return `#amountTooLow { amount; minAmount }`.
- `ledger` must be a supported ICRC ledger.
- If `caller` does not control `request.account`, return
  `#accountNotAuthorized { caller; account = request.account }`.
- `from.owner` must equal `caller`.
- The credited local account is `request.account`.
- The credited local node is `SPI101.externalLedgerNode(request.ledger)`.
- The ledger call is `icrc2_transfer_from` from `request.from` to the protocol
  canister's account.
- `from.subaccount` is passed through unchanged.
- Success credits exactly `amount` and returns a receipt.
- Ledger `#Err` results and call rejections do not credit local wallet state.

The local deposit credit is exactly `amount`. Any external ICRC fee is paid
according to the ledger's transfer-from rules.

Clients must not blindly retry a deposit if they did not observe the response to
their ingress call. They should query `spi_101_wallet` or ledger history first,
or use a future idempotent extension.

## Withdraw Semantics

`spi_103_icrc_withdraw(request)` moves local protocol balance back to an
external ICRC account.

Required behavior:

- `amount == 0` returns `#zeroAmount`.
- `ledger` must be a supported ICRC ledger.
- If `caller` does not control `request.account`, return
  `#accountNotAuthorized { caller; account = request.account }`.
- The debited local account is `request.account`.
- The debited local node is `SPI101.externalLedgerNode(request.ledger)`.
- The protocol obtains or uses a valid transfer fee for the ledger.
- The account must have at least `amount + fee` local balance at that node.
- Before awaiting the ledger, the implementation debits `amount + fee` into
  internal in-flight withdrawal state.
- A second overlapping withdraw for that account returns `#withdrawInProgress`.
- The ledger call is `icrc1_transfer` sending exactly `amount` to `request.to`.
- `to.subaccount` is passed through unchanged.
- Success finalizes the in-flight debit and returns a receipt with
  `debitAmount == amount + fee`.
- A ledger `#Err` result restores the full in-flight debit and returns
  `#icrcTransferErr`.
- A call rejection restores the full in-flight debit and returns
  `#icrcTransferRejected`.

The restore-on-rejection rule relies on supported standard ICRC ledgers and
unbounded-wait calls. Bounded-wait `SYS_UNKNOWN` calls cannot use this rule
safely without an idempotent reconciliation extension.

Clients must not blindly retry a withdraw if they did not observe the response
to their ingress call. They should query `spi_101_wallet` and the destination
ledger account first, or use a future idempotent extension.

## Test Shape

SPI-103 cannot be tested meaningfully by itself. Runtime tests should deploy an
actor that exposes both:

```text
spi_101_wallet
spi_103_icrc_deposit
spi_103_icrc_withdraw
```

The minimum client-visible tests are:

- successful ICRC deposit changes the SPI-101 wallet entry at `#ledger(ledger)`;
- failed deposit leaves the SPI-101 wallet unchanged;
- successful ICRC withdraw debits `amount + fee` from the SPI-101 wallet and
  transfers `amount` to the requested ICRC account;
- failed/rejected withdraw restores the in-flight debit;
- unsupported ledgers cannot change the SPI-101 wallet;
- callers cannot mutate or inspect accounts they do not control;
- subaccounts are passed through to ICRC transfer arguments.

## Kernel

The reference kernel is:

```motoko
import Kernel "mo:spi/103/Kernel";
```

It provides reusable predicates and lemmas for:

- account authorization through SPI-100 account ownership;
- supported-ledger checks;
- nonzero/minimum amount checks;
- deposit receipt/request binding;
- withdraw receipt/request binding;
- withdraw fee and `debitAmount == amount + fee` guarantees.

Implementations should put these predicates in public postconditions for
successful bridge calls. This lets examples and application actors prove the
same client-visible guarantees without rewriting the logic in every actor.

## Verification Targets

Implementations claiming SPI-103 should prove these boundaries:

- unsupported ledgers do not change SPI-101 wallet balances;
- callers cannot mutate accounts they do not control;
- deposits below the protocol minimum do not change local balances;
- deposits with `from.owner != caller` do not change local balances;
- failed deposits do not create local credit;
- successful deposits credit exactly `amount` once;
- withdrawals cannot start without enough local balance for `amount + fee`;
- overlapping withdrawals cannot double-spend the same local balance;
- successful withdrawals debit exactly `amount + fee` once;
- failed withdrawals restore exactly the in-flight debit;
- every successful deposit/withdraw receipt binds to the requested account,
  ledger, route, amount, and resulting wallet balance.
