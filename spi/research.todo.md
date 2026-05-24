# SPI Kernel Research TODO

Status: implemented as a research pass with canonical base kernel promotion
applied. All checklist items are complete. Remaining notes describe explicit
limitations or optional follow-up research, not hidden unfinished artifacts.

Final evaluation: `reference/dex/spi/research/eval.md`.

## Top-Level Work

- [x] Complete the baseline pass.
- [x] Implement and evaluate 3 SPI-101 alternatives.
- [x] Implement and evaluate 3 SPI-103 alternatives.
- [x] Implement and evaluate 2 SPI-102 alternatives.
- [x] Write the final cross-alternative `eval.md`.
- [x] Record failed strict gates instead of hiding them.
- [x] Promote the winning designs into canonical SPI files.

Promoted files: `101/Kernel.sr9`, `102/Kernel.sr9`, and `103/Kernel.sr9`.
Targeted verification succeeded for all three canonical kernels.

## Baseline

- [x] Create `reference/dex/spi/research/baseline/`.
- [x] Create `baseline/README.md`.
- [x] Create `baseline/eval.md`.
- [x] Record current canonical SPI-101 behavior.
- [x] Record current canonical SPI-102 behavior.
- [x] Record current canonical SPI-103 behavior.
- [x] Verify current canonical SPI-101, SPI-102, and SPI-103 modules.
- [x] Run current SPI-103 client tests.
- [x] Paste command results into `baseline/eval.md`.
- [x] Score the baseline using the strict scoring gate.
- [x] Identify baseline weaknesses that alternatives must address.

## Shared Artifact Gate

Every alternative folder below contains:

- [x] `README.md`
- [x] `spec.md`
- [x] `Kernel.sr9`
- [x] `examples/`
- [x] `proofs/`
- [x] `test/`
- [x] `notes.md`
- [x] `eval.md`
- [x] local actor fixture config
- [x] TypeScript client tests
- [x] generated actor fixtures inside the alternative folder

## SPI-101 Alternatives

### 101-A: Wallet Well-Formed Kernel

- [x] Create `research/101_alt_a_wallet_wellformed/`.
- [x] Define account authorization and wallet receipt binding predicates.
- [x] Define wallet entry well-formedness predicates.
- [x] Add kernel lemmas/proof observers.
- [x] Build an example actor with external ledger, local LP, active stake, and
  locked pending-unstake holdings.
- [x] Use the kernel in public actor `ensures`.
- [x] Add TS tests for authorized wallet query and unauthorized rejection.
- [x] Run verification.
- [x] Run runtime tests.
- [x] Write `eval.md`.

Outcome: pass. Recommended SPI-101 base winner.

### 101-B: Account Balance Book Kernel

- [x] Create `research/101_alt_b_balance_book/`.
- [x] Define reusable `AccountNodeBook` around `(SPI100.Account, NodeId)`.
- [x] Prove map ordering for empty/credit/debit helpers.
- [x] Build an example actor exposing `spi_101_wallet`.
- [x] Add documented setup helpers for client tests.
- [x] Add proof observers.
- [x] Add TS tests for ledger/local export and unauthorized query/setup.
- [x] Run verification.
- [x] Run runtime tests.
- [x] Write `eval.md`.
- [x] Fully prove no duplicate fungible export nodes and no zero fungible
  exports.

Outcome: pass with fixed-shape scalar export laws. Useful implementation
pattern, not recommended as a canonical storage requirement.

### 101-C: Capability And Pagination Kernel

- [x] Create `research/101_alt_c_capability_pagination/`.
- [x] Define account-exists, caller-controls-account, caller-can-view-account,
  filter, and cursor predicates.
- [x] Define account binding and `nextCursor` monotonicity laws.
- [x] Build an example actor with at least 5 holdings.
- [x] Make pagination necessary in TS tests.
- [x] Add proof observers.
- [x] Add TS tests for full scan, cursor handling, unauthorized scan, filters,
  and stable reconstruction.
- [x] Run verification.
- [x] Run runtime tests.
- [x] Write `eval.md`.
- [x] Fully prove no duplicates within a page and across a complete scan.

Outcome: pass with fixed cursor-window uniqueness. Recommended as a source of
cursor/capability laws to combine with 101-A.

## SPI-103 Alternatives

### 103-A: Receipt Binding Bridge Kernel

- [x] Create `research/103_alt_a_receipt_binding/`.
- [x] Start from the current SPI-103 kernel shape.
- [x] Tighten `canStartIcrcDeposit`.
- [x] Tighten `icrcDepositAccepted`.
- [x] Tighten `canStartIcrcWithdraw`.
- [x] Tighten `icrcWithdrawAccepted`.
- [x] Add ledger-node credit/debit predicates.
- [x] Add exact fee debit predicate.
- [x] Build a simulated bridge actor.
- [x] Ensure the bridge actor exposes `spi_101_wallet`.
- [x] Use kernel predicates in public bridge `ensures`.
- [x] Add proof observers for authorization, supported ledger, request binding,
  ledger node binding, and fee debit.
- [x] Add TS tests for deposit, withdraw, unsupported ledger, unauthorized
  caller, source owner mismatch, zero amount, minimum deposit, and fee headroom.
- [x] Run verification.
- [x] Run runtime tests.
- [x] Write `eval.md`.

Outcome: pass. Recommended SPI-103 base winner.

### 103-B: In-Flight Restore Kernel

- [x] Create `research/103_alt_b_inflight_restore/`.
- [x] Add a mock ICRC ledger actor fixture.
- [x] Mock ledger supports success mode.
- [x] Mock ledger supports `icrc2_transfer_from` error mode.
- [x] Mock ledger supports `icrc2_transfer_from` reject mode.
- [x] Mock ledger supports `icrc1_fee` reject mode.
- [x] Mock ledger supports `icrc1_transfer` error mode.
- [x] Mock ledger supports `icrc1_transfer` reject mode.
- [x] Define kernel predicates for deposit success/failure and withdraw
  start/success/failure restore.
- [x] Build an actor that performs real awaited calls to the mock ledger.
- [x] Add proof observers for local step laws.
- [x] Add TS tests for ledger modes, failed deposit, failed withdraw restore,
  zero amount, and insufficient balance.
- [x] Run runtime tests.
- [x] Write `eval.md`.
- [x] Verify `MockIcrcLedger.sr9`.
- [x] Verify `InFlightRestoreBridgeActor.sr9`.
- [x] Prove sound post-await restore behavior for the reserved debit.

Outcome: pass with narrow trusted adapters for intentional mock rejects and BMap
balance deltas. The old pre-await balance equality claim was removed because it
is unsound under actor interleaving.

### 103-C: Operation Id And Retry Extension

- [x] Create `research/103_alt_c_operation_id/`.
- [x] Define extension as an explicit profile, not a replacement for base
  SPI-103.
- [x] Add operation id type.
- [x] Add optional memo field.
- [x] Add optional created-at-time field.
- [x] Add operation status query.
- [x] Add reconciliation-needed state.
- [x] Define duplicate/no-double-credit/no-double-debit predicates.
- [x] Build an example actor with a small operation table.
- [x] Add proof observers for duplicate behavior.
- [x] Add TS tests for duplicate deposit, duplicate withdraw, retry/status, and
  reconciliation-needed state.
- [x] Run verification.
- [x] Run runtime tests.
- [x] Write `eval.md`.
- [x] Replace the verified one-slot operation table with a verified bounded
  multi-operation map.

Outcome: pass as an optional extension. `BMap<Nat, OperationStatus>` still hits
a verifier limitation, but the example now uses a verified bounded map rather
than a single slot.

## SPI-102 Alternatives

### 102-A: Canonical Basket And Discovery Kernel

- [x] Create `research/102_alt_a_canonical_basket_discovery/`.
- [x] Define basket direct lookup and containment helpers.
- [x] Define discovery response binding law.
- [x] Define quote binding and receipt binding laws.
- [x] Define guard acceptance laws for min receive, max spend, max fee, and
  deadline.
- [x] Build a DEX example using canonical baskets.
- [x] Add proof observers for basket/discovery laws.
- [x] Add TS tests for discovering nodes/edges.
- [x] Add TS tests that every edge references known nodes.
- [x] Add TS tests that quote selected edges.
- [x] Add TS tests that execute selected edges.
- [x] Add TS tests that reject malformed guards.
- [x] Run verification.
- [x] Run runtime tests.
- [x] Write `eval.md`.
- [x] Build the originally requested DAO example in this same alternative.
- [x] Verify `CanonicalBasketDaoActor.sr9` without backend cancellation.
- [x] Prove fixed-shape no-duplicate/no-zero basket laws without trusted array
  scans.
- [x] Prove fixed-shape discovery node/edge uniqueness without trusted array
  scans.
- [x] Fully prove generic sorted/no-duplicate/no-zero basket laws for unbounded
  arrays.
- [x] Fully prove generic discovery pagination uniqueness for unbounded arrays.

Outcome: kernel, DEX actor, DAO actor, fixed-shape basket/graph laws, and
runtime tests pass. Generic unbounded uniqueness is proved over injective
protocol projection arrays: amounts are nonzero by quantified Nat-array laws,
strictly sorted node/edge projection keys imply no duplicates, and adjacent
sorted pages with a boundary key are disjoint. Direct reusable predicates over
`[BasketEntry]` record arrays remain a verifier limitation and are documented in
notes.

### 102-B: Guard Reason And Protocol Law Kernel

- [x] Create `research/102_alt_b_guard_reason_laws/`.
- [x] Split `#guardRejected` into deadline, min-receive, max-spend, max-fee, and
  protocol-specific reasons.
- [x] Add `receiptAccepted` predicate.
- [x] Add DAO conservation protocol-law hook.
- [x] Add DEX conservation hook.
- [x] Build a DAO example proving generic guard acceptance at the kernel level.
- [x] Build a DAO example covering stake/request-unstake pending transitions.
- [x] Add proof observers for guard and conservation laws.
- [x] Add TS tests for every guard rejection reason.
- [x] Add TS test for stale quote rejection.
- [x] Add TS test for successful DAO pending transition.
- [x] Run runtime tests.
- [x] Write `eval.md`.
- [x] Verify `GuardReasonDaoActor.sr9`.
- [x] Build separate DEX example proving generic guard acceptance and
  protocol-specific accounting laws.
- [x] Add explicit TS test that failed execute does not mutate wallet-visible
  state.

Outcome: DAO actor, DEX actor, kernel, proofs, and runtime tests pass. Guard
reason variants are now a verified client-UX improvement, with the remaining
tradeoff being added API surface and observable reason ordering.

## Cross-Alternative Evaluation

- [x] Create `reference/dex/spi/research/eval.md`.
- [x] Include baseline score table.
- [x] Include all three SPI-101 alternatives in the score table.
- [x] Include all three SPI-103 alternatives in the score table.
- [x] Include both SPI-102 alternatives in the score table.
- [x] Choose SPI-101 winner and runner-up.
- [x] Choose SPI-103 winner and runner-up.
- [x] Choose SPI-102 winner and runner-up.
- [x] List rejected alternatives with reasons.
- [x] State canonical decisions for SPI-101.
- [x] State canonical decisions for SPI-102.
- [x] State canonical decisions for SPI-103.
- [x] List files that should become canonical if promoted.
- [x] List historical evidence to retain.
- [x] List examples/tests/proofs that should be regenerated.
- [x] Include remaining verifier limitations.
- [x] Include remaining client usability concerns.
- [x] Include simplest viable canonical design.
- [x] Include accepted and rejected complexity.
- [x] Include next implementation step.

## Final Done Criteria

- [x] Research alternatives exist in the required folder structure.
- [x] Every alternative has a kernel.
- [x] Every alternative has examples.
- [x] Every alternative has tests.
- [x] Every alternative has proofs.
- [x] Every alternative has notes.
- [x] Every alternative has a per-alternative eval.
- [x] Every passing alternative has verification command logs summarized in its
  `eval.md`.
- [x] Every passing alternative has runtime command logs summarized in its
  `eval.md`.
- [x] Every failing alternative explains exactly why it failed.
- [x] Every failing alternative classifies the failure.
- [x] `research/eval.md` picks the best designs.
- [x] `research/eval.md` gives a concrete canonical migration plan.
- [x] No alternative folder contains stale generated files outside its own test
  fixture directory.
- [x] Remaining limitations and follow-up items are documented explicitly, not
  hidden as unfinished artifacts.
