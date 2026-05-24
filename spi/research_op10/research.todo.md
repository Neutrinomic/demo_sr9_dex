# OP10 SPI Kernel Research TODO

Status: complete for the focused second pass.

Final evaluation: `reference/dex/spi/research_op10/eval.md`.

## Top-Level Work

- [x] Re-read the canonical SPI-101, SPI-102, and SPI-103 kernels.
- [x] Read the OP10 notes relevant to snapshots, receipts, summaries, and authority.
- [x] Verify the current canonical kernels as baseline.
- [x] Retest the old direct DTO array predicate limitation.
- [x] Build focused alternatives for SPI-101, SPI-102, and SPI-103.
- [x] Verify each alternative kernel.
- [x] Promote only verified, simple improvements into canonical kernels.
- [x] Record remaining limitations instead of hiding them.
- [x] Write final evaluation and next steps.

## Strict Gate

- [x] Kernel change verifies with targeted `sector9 --verify`.
- [x] Change improves implementer ergonomics or proof strength.
- [x] Change does not add broad DTO/API complexity.
- [x] Change follows OP10 authority model: receipts and scalar session facts carry authority; identity snapshots do not become payload facts.
- [x] Occam gate: if a wrapper/lemma solves the actor proof problem, do not promote a more complex type redesign.
- [x] Failed direct-array experiments are recorded as verifier limitations.

## Alternatives

### 101-A: Direct Wallet Array Laws

- [x] Create alternative folder.
- [x] Try direct reusable record-array well-formedness law.
- [x] Record failed direct array predicate result.
- [x] Keep only verified scalar receipt/page predicates in the kernel artifact.
- [x] Verify alternative kernel.
- [x] Decide whether to promote.

Outcome: do not promote; useful retest, but no canonical improvement yet.

### 102-A: Caller Execute/Quote Wrappers

- [x] Create alternative folder.
- [x] Add caller-authorized quote and execute wrapper predicates.
- [x] Add a caller execute lemma.
- [x] Verify alternative kernel.
- [x] Promote into canonical SPI-102.

Outcome: promote.

### 103-A: Receipt Session Laws

- [x] Create alternative folder.
- [x] Add pending-withdrawal session binding predicates.
- [x] Add settlement-to-canonical-withdraw lemmas.
- [x] Verify alternative kernel.
- [x] Promote into canonical SPI-103.

Outcome: promote.

## Baseline Findings

- [x] Canonical 101/102/103 kernels verify.
- [x] SPI-103 canonical examples verify with targeted commands.
- [x] Baseline found old SPI-102 examples importing the removed SPI-101 deposit/withdraw module.
- [x] SPI-102 canonical examples and client tests were later regrown around the current 100/101/102/103 split and verified.
- [x] Direct record-array DTO predicates still cannot be promoted cleanly.
