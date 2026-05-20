export const idlFactory = ({ IDL }) => {
  const DustAbandonReceipt = IDL.Record({
    'fee' : IDL.Nat,
    'user' : IDL.Principal,
    'ledger' : IDL.Principal,
    'balanceKey' : IDL.Text,
    'abandonedAmount' : IDL.Nat,
    'abandonedDustTotal' : IDL.Nat,
  });
  const DustAbandonError = IDL.Variant({
    'ledgerNotWhitelisted' : IDL.Principal,
    'ledgerHasPools' : IDL.Principal,
    'ledgerNotRetiring' : IDL.Principal,
    'ledgerHasPendingOps' : IDL.Principal,
    'subjectNotAuthorized' : IDL.Record({
      'subject' : IDL.Principal,
      'caller' : IDL.Principal,
    }),
    'noLocalBalance' : IDL.Null,
    'balanceExceedsFee' : IDL.Record({ 'fee' : IDL.Nat, 'balance' : IDL.Nat }),
  });
  const Result_7 = IDL.Variant({
    'ok' : DustAbandonReceipt,
    'err' : DustAbandonError,
  });
  const ControllerLedgerAction = IDL.Variant({
    'add' : IDL.Principal,
    'rem' : IDL.Principal,
    'retire' : IDL.Principal,
  });
  const LedgerReject = IDL.Record({ 'message' : IDL.Text });
  const ControllerLedgerError = IDL.Variant({
    'ledgerNotWhitelisted' : IDL.Principal,
    'ledgerAlreadyActive' : IDL.Principal,
    'ledgerHasPools' : IDL.Principal,
    'ledgerNotRetiring' : IDL.Principal,
    'ledgerHasPendingOps' : IDL.Principal,
    'ledgerAlreadyRetiring' : IDL.Principal,
    'ledgerHasLocalBalances' : IDL.Principal,
    'notController' : IDL.Null,
    'ledgerFeeRejected' : LedgerReject,
  });
  const Result_6 = IDL.Variant({
    'ok' : IDL.Null,
    'err' : ControllerLedgerError,
  });
  const PoolInfo = IDL.Record({
    'id' : IDL.Nat,
    'key' : IDL.Text,
    'lockedShares' : IDL.Nat,
    'reserveA' : IDL.Nat,
    'reserveB' : IDL.Nat,
    'ledgerA' : IDL.Principal,
    'ledgerB' : IDL.Principal,
    'totalShares' : IDL.Nat,
  });
  const CreatePoolError = IDL.Variant({
    'ledgerNotActive' : IDL.Principal,
    'notController' : IDL.Null,
    'sameLedger' : IDL.Null,
    'poolAlreadyExists' : IDL.Null,
  });
  const Result_5 = IDL.Variant({ 'ok' : PoolInfo, 'err' : CreatePoolError });
  const LiquidityRequest = IDL.Variant({
    'add' : IDL.Record({
      'minShares' : IDL.Nat,
      'ledgerA' : IDL.Principal,
      'ledgerB' : IDL.Principal,
      'maxAmountA' : IDL.Nat,
      'maxAmountB' : IDL.Nat,
    }),
    'rem' : IDL.Record({
      'shares' : IDL.Nat,
      'minAmountA' : IDL.Nat,
      'minAmountB' : IDL.Nat,
      'ledgerA' : IDL.Principal,
      'ledgerB' : IDL.Principal,
    }),
  });
  const AddLiquidityReceipt = IDL.Record({
    'shares' : IDL.Nat,
    'lockedShares' : IDL.Nat,
    'usedA' : IDL.Nat,
    'usedB' : IDL.Nat,
    'leftoverA' : IDL.Nat,
    'leftoverB' : IDL.Nat,
    'poolKey' : IDL.Text,
    'ledgerA' : IDL.Principal,
    'ledgerB' : IDL.Principal,
  });
  const RemoveLiquidityReceipt = IDL.Record({
    'shares' : IDL.Nat,
    'amountA' : IDL.Nat,
    'amountB' : IDL.Nat,
    'poolKey' : IDL.Text,
    'ledgerA' : IDL.Principal,
    'ledgerB' : IDL.Principal,
  });
  const LiquidityReceipt = IDL.Variant({
    'added' : AddLiquidityReceipt,
    'removed' : RemoveLiquidityReceipt,
  });
  const LiquidityError = IDL.Variant({
    'ledgerNotWhitelisted' : IDL.Principal,
    'ledgerNotActive' : IDL.Principal,
    'zeroAmount' : IDL.Null,
    'poolNotFound' : IDL.Null,
    'subjectNotAuthorized' : IDL.Record({
      'subject' : IDL.Principal,
      'caller' : IDL.Principal,
    }),
    'insufficientLocalBalance' : IDL.Null,
    'sameLedger' : IDL.Null,
    'insufficientLiquidity' : IDL.Null,
    'slippage' : IDL.Null,
  });
  const Result_4 = IDL.Variant({
    'ok' : LiquidityReceipt,
    'err' : LiquidityError,
  });
  const QuoteReceipt = IDL.Record({
    'ok' : IDL.Bool,
    'fee' : IDL.Nat,
    'ledgerIn' : IDL.Principal,
    'platformFee' : IDL.Nat,
    'amountIn' : IDL.Nat,
    'ledgerOut' : IDL.Principal,
    'lpFee' : IDL.Nat,
    'reserveIn' : IDL.Nat,
    'amountOut' : IDL.Nat,
    'reserveOut' : IDL.Nat,
    'minAmountOut' : IDL.Nat,
    'effectiveAmountIn' : IDL.Nat,
  });
  const QuoteError = IDL.Variant({
    'ledgerNotActive' : IDL.Principal,
    'zeroAmount' : IDL.Null,
    'poolNotFound' : IDL.Null,
    'sameLedger' : IDL.Null,
    'insufficientLiquidity' : IDL.Null,
  });
  const Result_3 = IDL.Variant({ 'ok' : QuoteReceipt, 'err' : QuoteError });
  const RemovePoolReceipt = IDL.Record({
    'key' : IDL.Text,
    'returnedA' : IDL.Nat,
    'returnedB' : IDL.Nat,
    'burnedUserShares' : IDL.Nat,
    'burnedLockedShares' : IDL.Nat,
    'ledgerA' : IDL.Principal,
    'ledgerB' : IDL.Principal,
    'settledUsers' : IDL.Nat,
    'controllerLockedA' : IDL.Nat,
    'controllerLockedB' : IDL.Nat,
  });
  const RemovePoolError = IDL.Variant({
    'poolNotFound' : IDL.Null,
    'notController' : IDL.Null,
    'sameLedger' : IDL.Null,
  });
  const Result_2 = IDL.Variant({
    'ok' : RemovePoolReceipt,
    'err' : RemovePoolError,
  });
  const ReturnLedgerBalancesReceipt = IDL.Record({
    'fee' : IDL.Nat,
    'returnedAmount' : IDL.Nat,
    'txIndex' : IDL.Opt(IDL.Nat),
    'returnedUser' : IDL.Opt(IDL.Principal),
    'returnedUsers' : IDL.Nat,
    'remainingLocalBalance' : IDL.Nat,
    'ledger' : IDL.Principal,
    'localBalance' : IDL.Nat,
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
  const ReturnLedgerBalancesError = IDL.Variant({
    'ledgerNotWhitelisted' : IDL.Principal,
    'ledgerHasPools' : IDL.Principal,
    'ledgerNotRetiring' : IDL.Principal,
    'ledgerHasPendingOps' : IDL.Principal,
    'returnBalanceDoesNotCoverFee' : IDL.Record({
      'fee' : IDL.Nat,
      'balance' : IDL.Nat,
    }),
    'ledgerTransferErr' : TransferError,
    'onlyDustBalances' : IDL.Record({
      'fee' : IDL.Nat,
      'remainingLocalBalance' : IDL.Nat,
    }),
    'ledgerTransferRejected' : LedgerReject,
    'notController' : IDL.Null,
  });
  const Result_1 = IDL.Variant({
    'ok' : ReturnLedgerBalancesReceipt,
    'err' : ReturnLedgerBalancesError,
  });
  const BalanceRequest = IDL.Record({ 'subject' : IDL.Principal });
  const BalanceKey = IDL.Principal;
  const BalanceEntry = IDL.Tuple(BalanceKey, IDL.Nat);
  const BalanceReceipt = IDL.Record({
    'subject' : IDL.Principal,
    'entries' : IDL.Vec(BalanceEntry),
  });
  const Account = IDL.Record({
    'owner' : IDL.Principal,
    'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const DepositRequest = IDL.Record({
    'subject' : IDL.Principal,
    'from' : Account,
    'ledger' : IDL.Principal,
    'amount' : IDL.Nat,
  });
  const DepositReceipt = IDL.Record({
    'txIndex' : IDL.Nat,
    'subject' : IDL.Principal,
    'from' : Account,
    'ledger' : IDL.Principal,
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
  const DepositError = IDL.Variant({
    'zeroAmount' : IDL.Null,
    'subjectNotAuthorized' : IDL.Record({
      'subject' : IDL.Principal,
      'caller' : IDL.Principal,
    }),
    'ledgerTransferFromErr' : TransferFromError,
    'ledgerTransferFromRejected' : LedgerReject,
    'sourceOwnerMismatch' : IDL.Record({
      'caller' : IDL.Principal,
      'fromOwner' : IDL.Principal,
    }),
    'amountTooLow' : IDL.Record({ 'minAmount' : IDL.Nat, 'amount' : IDL.Nat }),
    'ledgerNotSupported' : IDL.Principal,
  });
  const Result__1_1 = IDL.Variant({
    'ok' : DepositReceipt,
    'err' : DepositError,
  });
  const WithdrawRequest = IDL.Record({
    'to' : Account,
    'subject' : IDL.Principal,
    'ledger' : IDL.Principal,
    'amount' : IDL.Nat,
  });
  const WithdrawReceipt = IDL.Record({
    'to' : Account,
    'fee' : IDL.Nat,
    'txIndex' : IDL.Nat,
    'subject' : IDL.Principal,
    'debitAmount' : IDL.Nat,
    'ledger' : IDL.Principal,
    'balanceAfter' : IDL.Nat,
    'amount' : IDL.Nat,
  });
  const PendingWithdrawal = IDL.Record({
    'to' : Account,
    'fee' : IDL.Nat,
    'subject' : IDL.Principal,
    'debitAmount' : IDL.Nat,
    'ledger' : IDL.Principal,
    'amount' : IDL.Nat,
  });
  const WithdrawError = IDL.Variant({
    'zeroAmount' : IDL.Null,
    'subjectNotAuthorized' : IDL.Record({
      'subject' : IDL.Principal,
      'caller' : IDL.Principal,
    }),
    'ledgerTransferErr' : TransferError,
    'insufficientLocalBalance' : IDL.Null,
    'ledgerTransferRejected' : LedgerReject,
    'ledgerNotSupported' : IDL.Principal,
    'withdrawInProgress' : PendingWithdrawal,
    'ledgerFeeRejected' : LedgerReject,
  });
  const Result__1 = IDL.Variant({
    'ok' : WithdrawReceipt,
    'err' : WithdrawError,
  });
  const SwapReceipt = IDL.Record({
    'fee' : IDL.Nat,
    'ledgerIn' : IDL.Principal,
    'platformFee' : IDL.Nat,
    'reserveOutAfter' : IDL.Nat,
    'amountIn' : IDL.Nat,
    'ledgerOut' : IDL.Principal,
    'lpFee' : IDL.Nat,
    'reserveInAfter' : IDL.Nat,
    'reserveInBefore' : IDL.Nat,
    'amountOut' : IDL.Nat,
    'minAmountOut' : IDL.Nat,
    'reserveOutBefore' : IDL.Nat,
    'effectiveAmountIn' : IDL.Nat,
  });
  const SwapError = IDL.Variant({
    'ledgerNotActive' : IDL.Principal,
    'zeroAmount' : IDL.Null,
    'poolNotFound' : IDL.Null,
    'subjectNotAuthorized' : IDL.Record({
      'subject' : IDL.Principal,
      'caller' : IDL.Principal,
    }),
    'insufficientLocalBalance' : IDL.Null,
    'sameLedger' : IDL.Null,
    'insufficientLiquidity' : IDL.Null,
    'slippage' : IDL.Null,
  });
  const Result = IDL.Variant({ 'ok' : SwapReceipt, 'err' : SwapError });
  const DexActorDemo = IDL.Service({
    'abandonDust' : IDL.Func([IDL.Principal, IDL.Principal], [Result_7], []),
    'controller_ledger' : IDL.Func([ControllerLedgerAction], [Result_6], []),
    'createPool' : IDL.Func([IDL.Principal, IDL.Principal], [Result_5], []),
    'liquidity' : IDL.Func([IDL.Principal, LiquidityRequest], [Result_4], []),
    'pools' : IDL.Func([], [IDL.Vec(PoolInfo)], ['query']),
    'quote' : IDL.Func(
        [IDL.Principal, IDL.Principal, IDL.Nat, IDL.Nat],
        [Result_3],
        ['query'],
      ),
    'removePool' : IDL.Func([IDL.Principal, IDL.Principal], [Result_2], []),
    'returnLedgerBalances' : IDL.Func([IDL.Principal], [Result_1], []),
    'spi_101_balance' : IDL.Func([BalanceRequest], [BalanceReceipt], ['query']),
    'spi_101_deposit' : IDL.Func([DepositRequest], [Result__1_1], []),
    'spi_101_withdraw' : IDL.Func([WithdrawRequest], [Result__1], []),
    'swap' : IDL.Func(
        [IDL.Principal, IDL.Principal, IDL.Principal, IDL.Nat, IDL.Nat],
        [Result],
        [],
      ),
  });
  return DexActorDemo;
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
