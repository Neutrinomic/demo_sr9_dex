# Notes

- `nodeKey` appends a one-byte family marker to avoid confusing ledger and local
  payload spaces. This is extra complexity compared with using raw blobs, but
  it prevents a real node-key collision footgun.
- Export no-duplicate/no-zero laws are now proved for the fixed wallet export
  shape by using scalar snapshots of amount and node ids before constructing
  the response array. Generic array normalization is still intentionally outside
  this storage helper.
