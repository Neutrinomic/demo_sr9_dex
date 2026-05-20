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
