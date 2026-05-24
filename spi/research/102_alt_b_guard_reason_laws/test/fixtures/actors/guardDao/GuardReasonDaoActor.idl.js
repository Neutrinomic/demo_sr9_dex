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
  const Result_2 = IDL.Variant({ 'ok' : WalletReceipt, 'err' : WalletError });
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
  const GuardRejectReason = IDL.Variant({
    'maxSpend' : IDL.Null,
    'deadline' : IDL.Null,
    'protocolSpecific' : IDL.Text,
    'maxFee' : IDL.Null,
    'minReceive' : IDL.Null,
  });
  const ExecuteError = IDL.Variant({
    'insufficientInput' : IDL.Null,
    'unknownEdge' : IDL.Null,
    'accountNotAuthorized' : IDL.Record({
      'account' : IDL.Vec(IDL.Nat8),
      'caller' : IDL.Principal,
    }),
    'edgeNotLive' : DiscoveryStatus,
    'guardRejected' : GuardRejectReason,
    'protocolSpecific' : IDL.Text,
    'quoteReceiptMismatch' : IDL.Null,
    'expiredQuote' : IDL.Null,
    'invalidAmount' : IDL.Null,
  });
  const Result_1 = IDL.Variant({ 'ok' : Receipt, 'err' : ExecuteError });
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
  const Result = IDL.Variant({ 'ok' : Quote, 'err' : ExecuteError });
  const GuardReasonDaoActor = IDL.Service({
    'advance_time' : IDL.Func([IDL.Int], [], []),
    'raw_balances' : IDL.Func([], [IDL.Nat, IDL.Nat, IDL.Nat], ['query']),
    'setup_credit' : IDL.Func([Account, IDL.Nat], [], []),
    'spi_100_account' : IDL.Func(
        [IDL.Principal, IDL.Nat],
        [IDL.Opt(Account)],
        ['query'],
      ),
    'spi_101_wallet' : IDL.Func([WalletRequest], [Result_2], ['query']),
    'spi_102_discover' : IDL.Func([DiscoverRequest], [Discovery], ['query']),
    'spi_102_execute' : IDL.Func([ExecuteRequest], [Result_1], []),
    'spi_102_quote' : IDL.Func([QuoteRequest], [Result], ['query']),
  });
  return GuardReasonDaoActor;
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
