export const idlFactory = ({ IDL }) => {
  const DemoError = IDL.Variant({
    'insufficientBalance' : IDL.Null,
    'virtualKeyUnavailable' : IDL.Null,
    'virtualIdTooLarge' : IDL.Null,
    'invalidAccount' : IDL.Null,
  });
  const PrincipalResult = IDL.Variant({
    'ok' : IDL.Principal,
    'err' : DemoError,
  });
  const NatResult = IDL.Variant({ 'ok' : IDL.Nat, 'err' : DemoError });
  const BalanceEntry = IDL.Tuple(IDL.Principal, IDL.Nat);
  const VirtualId = IDL.Nat;
  const ControlInfo = IDL.Record({
    'id' : IDL.Opt(VirtualId),
    'controller' : IDL.Principal,
  });
  const TransferResult = IDL.Variant({
    'ok' : IDL.Tuple(IDL.Nat, IDL.Nat),
    'err' : DemoError,
  });
  const UnifiedAccountLedgerDemo = IDL.Service({
    'account' : IDL.Func([IDL.Nat], [PrincipalResult], ['query']),
    'balance' : IDL.Func([IDL.Principal], [IDL.Nat], ['query']),
    'canUse' : IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'credit' : IDL.Func([IDL.Principal, IDL.Nat], [NatResult], []),
    'debit' : IDL.Func([IDL.Principal, IDL.Nat], [NatResult], []),
    'entries' : IDL.Func([], [IDL.Vec(BalanceEntry)], ['query']),
    'resolve' : IDL.Func([IDL.Principal], [IDL.Opt(ControlInfo)], ['query']),
    'transfer' : IDL.Func(
        [IDL.Principal, IDL.Principal, IDL.Nat],
        [TransferResult],
        [],
      ),
  });
  return UnifiedAccountLedgerDemo;
};
export const init = ({ IDL }) => { return []; };
