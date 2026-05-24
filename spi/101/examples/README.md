# SPI-101 Examples

The old SPI-101 examples implemented deposit, withdraw, and wallet together.
That shape has been retired.

SPI-101 is now wallet-only. The current executable example that demonstrates
wallet changes caused by ICRC deposit/withdraw lives in:

```text
../103/examples/SPI103IcrcWalletDemo.sr9
```

That example exposes both `spi_101_wallet` and the SPI-103 bridge methods,
because deposit/withdraw cannot be tested meaningfully without observing the
resulting wallet state.
