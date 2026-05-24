# Notes

- Invalid filters and cursors reuse `#accountNotAuthorized` because base
  SPI-101 has only one wallet error. That is a usability footgun; a future SPI
  should add `#invalidCursor` and `#invalidFilter`.
- Page uniqueness is proved as scalar cursor windows: each valid cursor maps to
  a non-overlapping index range, and the complete `null -> ?2 -> ?4 -> null`
  scan has disjoint ranges. This avoids array element aliasing while still
  proving the client-visible scan cannot revisit an index.
