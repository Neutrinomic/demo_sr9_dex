# Notes

Direct reusable record-array predicates still fail in pure function bodies.

Observed failure shape:

```text
pure function cannot access `entries`; pure functions can only use their
parameters and other pure functions
```

When moved into a lemma contract, the verifier then failed to preserve
permission to the record field at `entries[i]` for the postcondition.

Recommendation: keep SPI-101 entry-array well-formedness out of the canonical
kernel until SR9 has first-class immutable record-array predicate support.

