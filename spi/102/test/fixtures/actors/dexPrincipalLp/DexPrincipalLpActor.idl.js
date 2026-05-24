export const idlFactory = ({ IDL }) => {
  const Account = IDL.Vec(IDL.Nat8);
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
  const Result_4 = IDL.Variant({ 'ok' : WalletReceipt, 'err' : WalletError });
  const DiscoverRequest = IDL.Record({
    'cursor' : IDL.Opt(IDL.Nat),
    'limit' : IDL.Opt(IDL.Nat),
    'filter' : IDL.Opt(IDL.Text),
    'account' : Account,
  });
  const DiscoveryStatus = IDL.Variant({
    'insufficientInput' : IDL.Null,
    'notMature' : IDL.Record({ 'unlockAt' : IDL.Int }),
    'live' : IDL.Null,
    'protocolSpecific' : IDL.Text,
    'unauthorized' : IDL.Null,
    'paused' : IDL.Null,
  });
  const CanisterId = IDL.Principal;
  const EdgeId = IDL.Record({
    'id' : IDL.Nat,
    'scope' : CanisterId,
    'namespace' : IDL.Text,
  });
  const EdgeShape = IDL.Record({
    'inputNodes' : IDL.Vec(NodeId),
    'edgeId' : EdgeId,
    'risk' : IDL.Opt(IDL.Text),
    'displayLabel' : IDL.Opt(IDL.Text),
    'outputNodes' : IDL.Vec(NodeId),
  });
  const DiscoveryEdge = IDL.Record({
    'status' : DiscoveryStatus,
    'edge' : EdgeShape,
  });
  const NodeForm = IDL.Variant({
    'fungible' : IDL.Null,
    'nonfungible' : IDL.Null,
  });
  const NodeShape = IDL.Record({
    'nodeId' : NodeId,
    'displayAsset' : IDL.Opt(NodeId),
    'form' : NodeForm,
    'risk' : IDL.Opt(IDL.Text),
    'displayLabel' : IDL.Opt(IDL.Text),
  });
  const Discovery = IDL.Record({
    'witness' : IDL.Opt(IDL.Text),
    'edges' : IDL.Vec(DiscoveryEdge),
    'nodes' : IDL.Vec(NodeShape),
    'account' : Account,
    'nextCursor' : IDL.Opt(IDL.Nat),
  });
  const BasketEntry = IDL.Record({ 'node' : NodeId, 'amount' : IDL.Nat });
  const PositionEffect = IDL.Record({
    'metadata' : IDL.Opt(IDL.Text),
    'node' : NodeId,
    'unlockAt' : IDL.Opt(IDL.Int),
    'positionId' : IDL.Opt(IDL.Nat),
    'amount' : IDL.Nat,
  });
  const Quote = IDL.Record({
    'output' : IDL.Vec(BasketEntry),
    'expiresAt' : IDL.Opt(IDL.Int),
    'edgeId' : EdgeId,
    'fees' : IDL.Vec(BasketEntry),
    'preconditions' : IDL.Opt(IDL.Text),
    'witness' : IDL.Opt(IDL.Text),
    'account' : Account,
    'input' : IDL.Vec(BasketEntry),
    'positionOutputs' : IDL.Vec(PositionEffect),
    'positionInputs' : IDL.Vec(PositionEffect),
  });
  const Guard = IDL.Record({
    'maxSpend' : IDL.Vec(BasketEntry),
    'maxPriceImpact' : IDL.Opt(IDL.Nat),
    'minHealth' : IDL.Opt(IDL.Nat),
    'deadline' : IDL.Opt(IDL.Int),
    'minShares' : IDL.Opt(IDL.Nat),
    'maxFee' : IDL.Vec(BasketEntry),
    'maxDebt' : IDL.Opt(IDL.Nat),
    'extension' : IDL.Opt(IDL.Text),
    'minReceive' : IDL.Vec(BasketEntry),
  });
  const ExecuteRequest = IDL.Record({ 'quote' : Quote, 'guard' : Guard });
  const Receipt = IDL.Record({
    'output' : IDL.Vec(BasketEntry),
    'executedAt' : IDL.Int,
    'edgeId' : EdgeId,
    'fees' : IDL.Vec(BasketEntry),
    'witness' : IDL.Opt(IDL.Text),
    'account' : Account,
    'input' : IDL.Vec(BasketEntry),
    'positionRemaining' : IDL.Vec(PositionEffect),
    'positionOutputs' : IDL.Vec(PositionEffect),
    'positionInputs' : IDL.Vec(PositionEffect),
  });
  const ExecuteError = IDL.Variant({
    'insufficientInput' : IDL.Null,
    'unknownEdge' : IDL.Null,
    'accountNotAuthorized' : IDL.Record({
      'account' : Account,
      'caller' : IDL.Principal,
    }),
    'edgeNotLive' : DiscoveryStatus,
    'guardRejected' : IDL.Null,
    'protocolSpecific' : IDL.Text,
    'quoteReceiptMismatch' : IDL.Null,
    'expiredQuote' : IDL.Null,
    'invalidAmount' : IDL.Null,
  });
  const Result_3 = IDL.Variant({ 'ok' : Receipt, 'err' : ExecuteError });
  const Intent = IDL.Record({
    'positionId' : IDL.Opt(IDL.Nat),
    'amount' : IDL.Nat,
    'extension' : IDL.Opt(IDL.Text),
  });
  const QuoteRequest = IDL.Record({
    'edgeId' : EdgeId,
    'intent' : Intent,
    'account' : Account,
  });
  const Result_2 = IDL.Variant({ 'ok' : Quote, 'err' : ExecuteError });
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
  const DexPrincipalLpActor = IDL.Service({
    'pool_state' : IDL.Func(
        [],
        [
          IDL.Record({
            'totalLp' : IDL.Nat,
            'reserveA' : IDL.Nat,
            'reserveB' : IDL.Nat,
          }),
        ],
        ['query'],
      ),
    'spi_100_account' : IDL.Func(
        [IDL.Principal, IDL.Nat],
        [IDL.Opt(Account)],
        ['query'],
      ),
    'spi_101_wallet' : IDL.Func([WalletRequest], [Result_4], ['query']),
    'spi_102_discover' : IDL.Func([DiscoverRequest], [Discovery], ['query']),
    'spi_102_execute' : IDL.Func([ExecuteRequest], [Result_3], []),
    'spi_102_quote' : IDL.Func([QuoteRequest], [Result_2], ['query']),
    'spi_103_icrc_deposit' : IDL.Func([IcrcDepositRequest], [Result_1], []),
    'spi_103_icrc_withdraw' : IDL.Func([IcrcWithdrawRequest], [Result], []),
  });
  return DexPrincipalLpActor;
};
export const init = ({ IDL }) => {
  return [IDL.Principal, IDL.Principal, IDL.Principal, IDL.Nat];
};
