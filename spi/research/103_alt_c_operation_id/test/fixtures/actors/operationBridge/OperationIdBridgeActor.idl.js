export const idlFactory = ({ IDL }) => {
  const Account = IDL.Vec(IDL.Nat8);
  const OperationId = IDL.Nat;
  const WalletRequest = IDL.Record({
    'cursor' : IDL.Opt(IDL.Nat),
    'limit' : IDL.Opt(IDL.Nat),
    'filter' : IDL.Opt(IDL.Text),
    'account' : Account,
  });
  const HoldingStatus = IDL.Variant({
    'pending' : IDL.Record({ 'unlockAt' : IDL.Opt(IDL.Int) }),
    'locked' : IDL.Record({ 'unlockAt' : IDL.Opt(IDL.Int) }),
    'available' : IDL.Null,
  });
  const LedgerId = IDL.Principal;
  const NodeId = IDL.Variant({
    'local' : IDL.Vec(IDL.Nat8),
    'ledger' : LedgerId,
  });
  const NoMetadata = IDL.Null;
  const WalletHolding = IDL.Variant({
    'fungible' : IDL.Record({ 'meta' : NoMetadata, 'amount' : IDL.Nat }),
    'nonfungible' : IDL.Record({ 'id' : IDL.Nat, 'meta' : NoMetadata }),
  });
  const WalletEntry = IDL.Record({
    'status' : HoldingStatus,
    'displayAsset' : IDL.Opt(NodeId),
    'node' : NodeId,
    'displayLabel' : IDL.Opt(IDL.Text),
    'holding' : WalletHolding,
  });
  const WalletReceipt = IDL.Record({
    'witness' : IDL.Opt(IDL.Text),
    'entries' : IDL.Vec(WalletEntry),
    'account' : Account,
    'nextCursor' : IDL.Opt(IDL.Nat),
  });
  const WalletError = IDL.Variant({
    'accountNotAuthorized' : IDL.Record({
      'account' : Account,
      'caller' : IDL.Principal,
    }),
  });
  const Result_2 = IDL.Variant({ 'ok' : WalletReceipt, 'err' : WalletError });
  const Subaccount = IDL.Vec(IDL.Nat8);
  const Account__1 = IDL.Record({
    'owner' : IDL.Principal,
    'subaccount' : IDL.Opt(Subaccount),
  });
  const IcrcDepositRequest = IDL.Record({
    'from' : Account__1,
    'ledger' : LedgerId,
    'account' : Account,
    'amount' : IDL.Nat,
  });
  const DepositWithIdRequest = IDL.Record({
    'request' : IcrcDepositRequest,
    'memo' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'createdAtTime' : IDL.Opt(IDL.Nat64),
    'operationId' : OperationId,
  });
  const IcrcDepositReceipt = IDL.Record({
    'txIndex' : IDL.Nat,
    'from' : Account__1,
    'ledger' : LedgerId,
    'account' : Account,
    'balanceAfter' : IDL.Nat,
    'amount' : IDL.Nat,
  });
  const TransferFromError = IDL.Variant({
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'InsufficientAllowance' : IDL.Record({ 'allowance' : IDL.Nat }),
    'BadBurn' : IDL.Record({ 'min_burn_amount' : IDL.Nat }),
    'Duplicate' : IDL.Record({ 'duplicate_of' : IDL.Nat }),
    'BadFee' : IDL.Record({ 'expected_fee' : IDL.Nat }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : IDL.Nat64 }),
    'TooOld' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'balance' : IDL.Nat }),
  });
  const LedgerReject = IDL.Record({ 'message' : IDL.Text });
  const IcrcDepositError = IDL.Variant({
    'icrcTransferFromErr' : TransferFromError,
    'accountNotAuthorized' : IDL.Record({
      'account' : Account,
      'caller' : IDL.Principal,
    }),
    'zeroAmount' : IDL.Null,
    'icrcTransferFromRejected' : LedgerReject,
    'sourceOwnerMismatch' : IDL.Record({
      'caller' : IDL.Principal,
      'fromOwner' : IDL.Principal,
    }),
    'amountTooLow' : IDL.Record({ 'minAmount' : IDL.Nat, 'amount' : IDL.Nat }),
    'ledgerNotSupported' : LedgerId,
  });
  const Result_1 = IDL.Variant({
    'ok' : IcrcDepositReceipt,
    'err' : IcrcDepositError,
  });
  const IcrcWithdrawRequest = IDL.Record({
    'to' : Account__1,
    'ledger' : LedgerId,
    'account' : Account,
    'amount' : IDL.Nat,
  });
  const WithdrawWithIdRequest = IDL.Record({
    'request' : IcrcWithdrawRequest,
    'memo' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'createdAtTime' : IDL.Opt(IDL.Nat64),
    'operationId' : OperationId,
  });
  const IcrcWithdrawReceipt = IDL.Record({
    'to' : Account__1,
    'fee' : IDL.Nat,
    'txIndex' : IDL.Nat,
    'debitAmount' : IDL.Nat,
    'ledger' : LedgerId,
    'account' : Account,
    'balanceAfter' : IDL.Nat,
    'amount' : IDL.Nat,
  });
  const TransferError = IDL.Variant({
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'BadBurn' : IDL.Record({ 'min_burn_amount' : IDL.Nat }),
    'Duplicate' : IDL.Record({ 'duplicate_of' : IDL.Nat }),
    'BadFee' : IDL.Record({ 'expected_fee' : IDL.Nat }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : IDL.Nat64 }),
    'TooOld' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'balance' : IDL.Nat }),
  });
  const PendingIcrcWithdrawal = IDL.Record({
    'to' : Account__1,
    'fee' : IDL.Nat,
    'debitAmount' : IDL.Nat,
    'ledger' : LedgerId,
    'account' : Account,
    'amount' : IDL.Nat,
  });
  const IcrcWithdrawError = IDL.Variant({
    'icrcTransferErr' : TransferError,
    'accountNotAuthorized' : IDL.Record({
      'account' : Account,
      'caller' : IDL.Principal,
    }),
    'zeroAmount' : IDL.Null,
    'icrcTransferRejected' : LedgerReject,
    'insufficientLocalBalance' : IDL.Null,
    'icrcFeeRejected' : LedgerReject,
    'ledgerNotSupported' : LedgerId,
    'withdrawInProgress' : PendingIcrcWithdrawal,
  });
  const Result = IDL.Variant({
    'ok' : IcrcWithdrawReceipt,
    'err' : IcrcWithdrawError,
  });
  const OperationStatus = IDL.Variant({
    'depositOk' : IcrcDepositReceipt,
    'withdrawOk' : IcrcWithdrawReceipt,
    'reconciliationNeeded' : IDL.Record({
      'operationId' : OperationId,
      'account' : IDL.Vec(IDL.Nat8),
      'reason' : IDL.Text,
    }),
    'failed' : IDL.Text,
  });
  const OperationIdBridgeActor = IDL.Service({
    'setup_mark_reconciliation' : IDL.Func(
        [Account, OperationId, IDL.Text],
        [],
        [],
      ),
    'spi_100_account' : IDL.Func(
        [IDL.Principal, IDL.Nat],
        [IDL.Opt(Account)],
        ['query'],
      ),
    'spi_101_wallet' : IDL.Func([WalletRequest], [Result_2], ['query']),
    'spi_103_icrc_deposit_with_id' : IDL.Func(
        [DepositWithIdRequest],
        [Result_1],
        [],
      ),
    'spi_103_icrc_withdraw_with_id' : IDL.Func(
        [WithdrawWithIdRequest],
        [Result],
        [],
      ),
    'spi_103_operation_status' : IDL.Func(
        [OperationId],
        [IDL.Opt(OperationStatus)],
        ['query'],
      ),
  });
  return OperationIdBridgeActor;
};
export const init = ({ IDL }) => { return [IDL.Principal, IDL.Nat, IDL.Nat]; };
