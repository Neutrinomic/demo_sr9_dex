# OP10 SPI Kernel Research Notes

## What Improved

OP10 did improve the surrounding proof model for DEX-shaped code: receipts,
scalar summaries, entry snapshots, owner observers, and caller-facing helper
surfaces are now a better fit than they were during the first SPI pass.

The useful kernel-level promotions from this pass are simple:

- SPI-102 gets caller-oriented `quoteResultForCaller`,
  `checkExecuteForCaller`, and `executableForCaller` helpers.
- SPI-103 gets pending-withdrawal session laws connecting a reserved debit to a
  later withdraw receipt.

These match the OP10 model: a receipt or session object is evidence for a local
transition. They do not rely on collection identity becoming payload authority.

## Still Blocked

The old direct record-array predicate gap remains. A reusable shape like this
still fails:

```motoko
public pure func walletEntriesWellFormed(entries : [WalletEntry]) : Bool
  reads entries
{
  forall<Nat>(pure func (i : Nat) : Bool =
    i < entries.size() ==> walletEntryWellFormed(entries[i]))
}
```

The verifier rejects the closure over `entries`, or later cannot preserve
permission to record fields in `entries[i]` across the postcondition.

For SPI-102 baskets, this means the projection-key workaround is still the
right canonical route. We should not make the kernel ugly by pretending direct
DTO-array finite-map proofs are ready.

## Example State

SPI-103 examples verify. The canonical SPI-102 examples and client fixture/PIC
tests have been regrown from the current 100/101/102/103 split: user accounts
are SPI-100 account blobs, wallet holdings are reported through SPI-101,
transitions run through SPI-102, and ICRC deposits/withdrawals moved to
SPI-103.

The SPI-102 harness now exercises account encoding, generated Candid, discovery
node/edge explainability, SPI-103 funding/withdrawal, SPI-101 wallet holdings,
guard rejection, quote expiration, authorization, and DAO pending-unstake
maturity.
