# Evaluation

Status: partial pass, not promoted.

The kernel artifact verifies, but only after removing the direct record-array
predicate. This confirms the old limitation still matters.

Command:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/research_op10/101_alt_a_direct_wallet_array_laws/Kernel.sr9
```

Result: succeeded.

Decision: do not promote. The verified scalar predicates are not enough of an
improvement over canonical SPI-101.

