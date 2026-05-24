# 101-B Spec

This alternative adds a reusable balance book behind SPI-101 wallet export.

The simplest useful state model is:

```text
(SPI100.Account, canonical NodeId key) -> Nat
```

The actor exports positive balances as SPI-101 fungible wallet entries.

This tests whether a shared book improves actor cleanliness before adding
pagination or richer nonfungible holdings.
