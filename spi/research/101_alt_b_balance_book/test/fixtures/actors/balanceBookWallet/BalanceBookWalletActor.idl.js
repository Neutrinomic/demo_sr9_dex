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
  const Result = IDL.Variant({ 'ok' : WalletReceipt, 'err' : WalletError });
  const BalanceBookWalletActor = IDL.Service({
    'setup_credit_ledger' : IDL.Func([Account, IDL.Nat], [IDL.Nat], []),
    'setup_credit_local' : IDL.Func([Account, IDL.Nat], [IDL.Nat], []),
    'spi_100_account' : IDL.Func(
        [IDL.Principal, IDL.Nat],
        [IDL.Opt(Account)],
        ['query'],
      ),
    'spi_101_wallet' : IDL.Func([WalletRequest], [Result], ['query']),
  });
  return BalanceBookWalletActor;
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
