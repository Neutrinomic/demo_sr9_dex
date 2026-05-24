export const idlFactory = ({ IDL }) => {
  const Account = IDL.Vec(IDL.Nat8);
  const LocalId = IDL.Nat;
  const Wallet = IDL.Principal;
  const DecodedAccount = IDL.Record({ 'id' : LocalId, 'wallet' : Wallet });
  const SPI100CodecActor = IDL.Service({
    'spi_100_account_id' : IDL.Func([Account], [IDL.Opt(IDL.Nat)], ['query']),
    'spi_100_account_wallet' : IDL.Func(
        [Account],
        [IDL.Opt(IDL.Principal)],
        ['query'],
      ),
    'spi_100_base58_decode' : IDL.Func(
        [IDL.Text],
        [IDL.Opt(IDL.Vec(IDL.Nat8))],
        ['query'],
      ),
    'spi_100_base58_encode' : IDL.Func(
        [IDL.Vec(IDL.Nat8)],
        [IDL.Text],
        ['query'],
      ),
    'spi_100_belongs_to_wallet' : IDL.Func(
        [Account, IDL.Principal],
        [IDL.Bool],
        ['query'],
      ),
    'spi_100_decode' : IDL.Func(
        [Account],
        [IDL.Opt(DecodedAccount)],
        ['query'],
      ),
    'spi_100_encode' : IDL.Func(
        [IDL.Principal, IDL.Nat],
        [IDL.Opt(Account)],
        ['query'],
      ),
    'spi_100_text_decode' : IDL.Func([IDL.Text], [IDL.Opt(Account)], ['query']),
    'spi_100_text_encode' : IDL.Func([Account], [IDL.Opt(IDL.Text)], ['query']),
  });
  return SPI100CodecActor;
};
export const init = ({ IDL }) => { return []; };
