export const idlFactory = ({ IDL }) => {
  const DemoError = IDL.Variant({
    'insufficientBalance' : IDL.Null,
    'virtualKeyUnavailable' : IDL.Null,
    'notController' : IDL.Null,
  });
  const PrincipalResult = IDL.Variant({
    'ok' : IDL.Principal,
    'err' : DemoError,
  });
  const NatResult = IDL.Variant({ 'ok' : IDL.Nat, 'err' : DemoError });
  const MoveResult = IDL.Variant({
    'ok' : IDL.Tuple(IDL.Nat, IDL.Nat),
    'err' : DemoError,
  });
  const BalanceEntry = IDL.Tuple(IDL.Principal, IDL.Nat);
  const ProtocolVirtualAssetDemo = IDL.Service({
    'asset' : IDL.Func([IDL.Nat], [PrincipalResult], ['query']),
    'balance' : IDL.Func([IDL.Nat], [NatResult], ['query']),
    'callerControlsAsset' : IDL.Func([IDL.Nat], [IDL.Bool], ['query']),
    'controllerCredit' : IDL.Func([IDL.Nat, IDL.Nat], [NatResult], []),
    'controllerDebit' : IDL.Func([IDL.Nat, IDL.Nat], [NatResult], []),
    'controllerMove' : IDL.Func([IDL.Nat, IDL.Nat, IDL.Nat], [MoveResult], []),
    'entries' : IDL.Func([], [IDL.Vec(BalanceEntry)], ['query']),
  });
  return ProtocolVirtualAssetDemo;
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
