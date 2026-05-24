# Notes

- The mock ledger uses `Runtime.trap` to simulate rejected ICRC calls. Its
  reject-capable actor methods are marked `trusted` because intentional trap
  branches are otherwise translated as reachable `false`.
- `AccountLedgerBook.creditFromKnownBalance` and `debitFromKnownBalance` are
  trusted BMap delta adapters. The underlying `credit`/`debit` helpers verify,
  but the actor proof needs a scalar balance snapshot after an `await`.
- The bridge proof no longer claims that a pre-await balance is unchanged after
  an awaited ledger call. That claim is unsound under actor interleaving. It now
  proves the local post-await effect the canister controls: deposit credits from
  the current post-await balance, and failed withdraw restores the reserved
  debit onto the current post-await balance.
