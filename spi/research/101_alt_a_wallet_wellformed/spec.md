# 101-A Spec

This alternative keeps SPI-101 wallet-only and adds a small kernel around the
client-visible wallet guarantees.

The kernel guarantee for a successful wallet response is:

```text
caller controls request.account
receipt.account == request.account
```

Entry-shape predicates are separate so actors can prove individual entries
without forcing every implementation into one canonical export algorithm.

Occam result: this is the simplest useful wallet kernel. It does not solve
deduplication or pagination; those are tested in later alternatives.
