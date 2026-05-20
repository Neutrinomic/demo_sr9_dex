# SPI-100 Notes

## SR9 Verifier Ergonomics

- Complex postconditions that repeat expressions like
  `Blob.slice(blob, 0, Blob.size(blob) - idBytes - 1)` do not reliably connect
  to local implementation bindings such as `scopeBlob`, even when the local
  value was created with the same expression and its size was checked. This came
  up while trying to prove `decode(encode(scope, id))` directly from the
  byte-level decoder contract. Workaround: keep the byte/principal facts in
  narrow core helpers and expose simpler result-surface contracts on SPI-100
  functions instead of exporting large repeated blob expressions.
- Imported `public let` constants can disappear from downstream specs even when
  the defining module verifies by itself. This happened with `maxId`,
  `reservedClass`, `anonymousClass`, and `maxEmbeddedPrincipalBytes` when
  verifying the observer module. Workaround: keep the constants for runtime/API
  readability, but use literal values in exported contracts and proof modules.
