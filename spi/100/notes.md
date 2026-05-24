# SPI-100 Notes

## SR9 Verifier Ergonomics

- Complex postconditions that repeat expressions like
  `Blob.slice(blob, 0, Blob.size(blob) - checksumBytes)` do not reliably connect
  to local implementation bindings such as `payload`, even when the local value
  was created with the same expression and its size was checked. This came up
  while trying to prove text checksum roundtrips directly from the byte-level
  decoder contract. Workaround: keep the byte/principal facts in narrow core
  helpers and expose simpler result-surface contracts on SPI-100 functions
  instead of exporting large repeated blob expressions.
- Imported `public let` constants can disappear from downstream specs even when
  the defining module verifies by itself. This happened with `maxId` and
  byte-size constants when verifying the observer module. Workaround: keep the
  constants for runtime/API readability, but use literal values in exported
  contracts and proof modules when needed.
- The SPI-100 no-collision lemmas are checked from the public codec contracts,
  but the byte parser itself is still a `pure trusted` function. Fully removing
  that trust boundary would require stronger core facts for
  `Blob.fromArray`/`Blob.get` over tabulated arrays and
  `Principal.fromBlob`/`Principal.toBlob` roundtrips. Until those core facts are
  available, `decode` owns the canonical re-encode postcondition and the
  injectivity lemmas prove the algebra above that contract.
