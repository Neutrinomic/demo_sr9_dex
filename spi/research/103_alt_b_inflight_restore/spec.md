# SPI-103 Alternative B Spec

This alternative keeps the canonical SPI-103 request/receipt/error types but
adds an implementation profile for real ledger awaits.

Deposit laws:

- Precheck failure returns before local mutation.
- `icrc2_transfer_from` success credits exactly `request.amount`.
- `icrc2_transfer_from` error or reject creates no local credit.

Withdrawal laws:

- The bridge reads the ledger fee before local debit.
- A started withdrawal debits `request.amount + fee` and records a pending
  withdrawal before the transfer await.
- Success clears the pending withdrawal and does not restore the debit.
- Ledger error or reject restores the full pending debit and clears pending.
- A second withdrawal while pending is rejected with `#withdrawInProgress`.

Tradeoff: the example proves the local step laws as kernel predicates and uses
them in the actor. Full cross-await linearizability is still mostly validated by
runtime tests, because the verifier has limited visibility through actor await
interleavings.

