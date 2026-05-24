# SR9 Notes

## Viper translator: switch expression in Nat binding

While verifying the first version of the SPI-101 withdraw flow module, this
expression:

```motoko
let cachedFee = switch (Dex.cachedFee(dex, request.ledger)) {
  case (?fee) { fee };
  case null { 0 }
};
```

caused Viper translation to fail with:

```text
translation to viper failed:
break in expression context
```

Repro command:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/standard_icrc/dex/lib/DexSPI101WithdrawFlow.sr9
```

Workaround: use a statement switch assigning into a `var`.

## Viper translator: generic variant construction

While making SPI-101 holdings extensible, this shape verifies as a type:

```motoko
public type Holding<FungibleMeta, NonfungibleMeta> = {
  #fungible : { amount : Nat; meta : FungibleMeta };
  #nonfungible : { id : Nat; meta : NonfungibleMeta }
};
```

But constructing an instantiated generic variant directly from a verified
function currently produces a Viper type error:

```motoko
public type NoMetadata = ();
public type WalletHolding = Holding<NoMetadata, NoMetadata>;

public func f() : WalletHolding {
  #fungible({ amount = 1; meta = () })
}
```

Repro command:

```bash
tmp=$(mktemp /tmp/spi101_generic_XXXX.mo)
printf 'module { public type NoMetadata = (); public type Holding<F,N> = { #fungible : { amount : Nat; meta : F }; #nonfungible : { id : Nat; meta : N } }; public type WalletHolding = Holding<NoMetadata, NoMetadata>; public func f() : WalletHolding { #fungible({ amount = 1; meta = () }) }; }\n' > "$tmp"
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --verify "$tmp"
rm -f "$tmp"
```

The generic variant also caused Viper type-argument errors when it lived in the
main `DepositWithdrawBalance.sr9` module and another SPI module imported that
file.

Workaround: keep the standard SPI-101 wallet type monomorphic in the main import
path, and keep the generic metadata shape in the optional
`reference/dex/spi/101/Holdings.sr9` profile module. Code using that profile
should route construction through its small trusted constructors,
`Holdings.fungible` and `Holdings.nonfungible`, until generic variant
construction/import support improves.
