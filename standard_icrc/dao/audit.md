# DAO Security TODO

## Scope

This practical audit reviewed:

- `lib/Dao.sr9`
- `lib/Types.sr9`
- `DaoActorDemo.sr9`
- `README.md`
- the bundled SR9 DEX reference exported from the current SR9 image under
  `.sr9docs/apps/dex`

The review intentionally ignores formal verification claims and focuses on production security, user-funds safety, governance correctness, operational liveness, and user-facing behavior.

## TODO

- [x] **High: handle ambiguous withdrawal ledger results without refunding.**
  `DaoActorDemo.sr9:179`, `lib/Dao.sr9:783`, `lib/Dao.sr9:851`.
  Any `icrc1_transfer` `#Err` currently restores the pending debit to liquid. Add durable withdrawal operation IDs, memo/timestamp correlation, and a reconciliation-needed state for duplicate or unknown outcomes. Refund only errors that are guaranteed not to have executed.

- [x] **High: add recovery for stuck pending withdrawals.**
  `DaoActorDemo.sr9:173`, `DaoActorDemo.sr9:179`, `lib/Dao.sr9:697`.
  `WithdrawalOps` now stores pending operation metadata separately from the main DAO state and `pending_withdrawal(user)` exposes it. The public retry endpoint was removed when the DAO moved to SPI-101's guaranteed-response flow: a single withdrawal call finalizes success or restores the pending debit on ledger error/reject.

- [x] **High: prevent immediate proposal close griefing.**
  `DaoActorDemo.sr9:260`, `lib/Dao.sr9:1277`, `lib/Dao.sr9:1303`.
  `close(id)` has no caller restriction and no voting period. Store proposal creation time and voting deadline. Allow close only after the deadline, or only when the outcome is mathematically final.

- [x] **High: make vote weight safe against stake recycling.**
  `lib/Dao.sr9:1173`, `lib/Dao.sr9:1248`, `lib/Dao.sr9:978`.
  `proposalSnapshotStake` is recorded but not used to compute votes. Use proposal-time snapshots or lock the exact stake used for voting until proposal finalization so the same tokens cannot vote again through another principal while a proposal is open.

- [x] **High: implement real config validation.**
  `lib/Dao.sr9:107`, `lib/Dao.sr9:475`, `lib/Dao.sr9:1357`.
  `configValid` and `actionValid` always return true. Validate constructor config and governance config actions. Reject zero, trivializing, or permanently unreachable quorum and proposal-threshold settings.

- [x] **Medium: add idempotency and correlation data to ledger calls.**
  `DaoActorDemo.sr9:60`, `DaoActorDemo.sr9:61`, `DaoActorDemo.sr9:83`, `DaoActorDemo.sr9:85`.
  Deposits and withdrawals now include per-operation memo/timestamp data. Deposit duplicate responses are not credited without a matching local deposit operation record, withdrawal duplicates finalize only against a pending debit, and pending withdrawals keep retry metadata in `WithdrawalOps`.

- [x] **Medium: prune or bound storage growth.**
  `lib/Dao.sr9:765`, `lib/Dao.sr9:1262`.
  Proposal storage is bounded to 32 lifetime proposals. Vote maps are keyed by
  proposal id and user, so multiple proposals can be open at the same time while
  proposal creation rejects after capacity is reached.

- [x] **Low: make `voting_power` report eligible voting power or rename it.**
  `DaoActorDemo.sr9:112`, `lib/Dao.sr9:1252`.
  `voting_power(user)` returns active stake even when it is still locked. Rename it to `active_stake`, or make it time-aware and return only currently eligible voting power.

## DEX Reference Audit Notes

- The current repository does not track DEX source. The DEX reference used for comparison is bundled in the SR9 image and was exported temporarily from `.sr9docs/apps/dex`.

- **Acceptable: outbound DEX transfers are single in-flight calls.**
  The DEX actor builds deposit and withdrawal ledger calls with `memo = null` and `created_at_time = null`. Under the Internet Computer call model, a sent inter-canister call returns a reply or reject; if the DEX does not submit the same outbound request twice, duplicate-transfer idempotency is not required for this demo flow. The DAO's memo/timestamp correlation remains useful traceability, but the public DAO API now follows the same single-call SPI-101 shape.

- **Acceptable: DEX withdrawal ledger `#Err` refunds locally.**
  In the intended ICRC ledger semantics, a transfer `#Err` means the transfer was not made. Under that assumption, restoring the pending local debit on `#Err` is acceptable. The DAO now follows the same SPI-101 guaranteed-response model and does not expose a public retry endpoint.

- **Acceptable: DEX deposits have in-flight guards without operation correlation.**
  `InFlightDeposits` tracks pending ledger activity by ledger key. Because the actor sends one inter-canister request and receives a guaranteed reply or reject, the lack of memo/timestamp correlation is acceptable for this demo flow. The DAO's operation correlation is extra traceability and retry hardening, not a required fix for the DEX pattern.

- **Acceptable: DEX pending modules match the single-call flow.**
  `PendingWithdrawals` and `PendingReturns` are useful opaque modules with ledger totals and one-operation-per-key behavior. Because the DEX waits on one guaranteed ledger reply or reject, separate retry/finalize endpoints are not required for that design. The DAO keeps `WithdrawalOps` as an internal one-operation pending guard, not as a public retry surface.

- **Assumption: whitelisted ledgers are trusted.**
  The DEX relies on controller-managed ledger allowlisting and assumes listed ledgers behave truthfully like standard ICRC ledgers. The DAO currently makes the same kind of trust assumption for its configured governance ledger.

### DAO Takeaways From The DEX

- Keep actor `await` code thin and put accounting transitions in verified modules.
- Split pending async operation state into separate opaque modules.
- Track explicit totals and prove conservation on every transition.
- Keep the pending-debit pattern around awaits; under SPI-101's guaranteed-response model, finalize success or restore the debit from the returned ledger error/reject.
- Use private rich-contract implementation functions with public import-safe wrappers.

## Assumptions

- Users are expected to deposit through the DAO `spi_101_deposit(request)` flow. Direct token transfers to the DAO account are unsupported and are outside this security TODO list.
- The deployed `governanceLedger` principal is assumed to be the intended trusted ICRC ledger. This DAO does not plan to validate ledger module hash, token metadata, or supported standards as part of the current hardening work.

## Overall Assessment

The DAO is materially hardened for a verified demo and has addressed the main user-funds and governance risks found in this audit. It now has SPI-101 real-token deposit and withdrawal flows, SPI-100 subjects, staking locks for voting eligibility, vote locking, proposal deadlines, config validation, bounded proposal vote storage, and ledger-call correlation.

The remaining production risk is mostly operational and deployment-specific: the configured governance ledger is trusted, users must deposit through the DAO flow, direct token transfers to the DAO account are unsupported, upgrade runbooks are not defined here, and the current design intentionally supports one governance ledger.
