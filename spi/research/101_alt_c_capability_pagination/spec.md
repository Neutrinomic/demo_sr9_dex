# 101-C Spec

This alternative adds explicit capability and pagination predicates to SPI-101.

Successful pages must satisfy:

```text
caller can view account
filter is accepted
cursor is valid
receipt.account == request.account
receipt.nextCursor is monotonic relative to request.cursor
```

The alternative does not try to prove no duplicates across all pages. It records
that as future work because the simple monotonic cursor law gives most of the
client value with less proof machinery.
