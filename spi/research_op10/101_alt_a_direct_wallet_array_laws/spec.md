# Spec

The intended law was:

```text
walletEntriesWellFormed(entries) =>
  every returned wallet entry is well formed
```

This would let `spi_101_wallet` promise account binding, cursor progress, and
entry validity in one kernel predicate.

The direct array predicate remains blocked, so the verified part of this
alternative is only scalar receipt/page binding.

