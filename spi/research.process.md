# SPI Research Process

This document is a reusable process for running future SPI/kernel research.
It captures the method that worked for the SPI-100/101/102/103 work: grow
multiple alternatives from a seed spec, test them as real client-facing
canisters, verify as much as possible, record limitations honestly, then promote
the simplest design that survives the gates.

## Goal

Research is not a brainstorm folder. It must answer:

- Is the seed spec strong enough?
- Can a kernel make implementations easier to verify?
- Can client apps use the API without hidden protocol knowledge?
- Which alternative should become canonical?
- What did SR9 prevent us from proving, and what would improve it?

The output is a decision, not just artifacts.

## Folder Shape

Use one top-level research folder:

```text
reference/dex/spi/research/
  baseline/
  <spi>_alt_a_<name>/
  <spi>_alt_b_<name>/
  <spi>_alt_c_<name>/
  eval.md
  notes.md
```

Each alternative folder must contain:

```text
README.md
spec.md
Kernel.sr9
examples/
proofs/
test/
notes.md
eval.md
```

For client tests, keep generated fixtures inside the alternative:

```text
test/config.json
test/spec/*.test.ts
test/fixtures/actors/<actor>/
test/reports/
```

Do not share generated fixtures across alternatives. Shared fixtures make it
hard to know which result came from which seed.

## Baseline First

Before alternatives, capture the current canonical state.

Baseline checklist:

```md
## Baseline

- [ ] Create `research/baseline/`.
- [ ] Create `baseline/README.md`.
- [ ] Create `baseline/eval.md`.
- [ ] Record current canonical types and kernels.
- [ ] Verify current canonical modules.
- [ ] Run existing client/runtime tests.
- [ ] Paste command results into `baseline/eval.md`.
- [ ] Score the baseline using the strict gate.
- [ ] Identify weaknesses alternatives must address.
```

The baseline prevents vague comparisons. Every alternative is judged against a
known starting point.

## Alternative Design Rule

Each alternative should test one thesis.

Good alternative examples:

- "Wallet entries should have a well-formedness kernel."
- "A balance book implementation helper should prove storage ordering."
- "Guard rejection reasons are worth exposing to clients."
- "Operation ids should be an extension, not base SPI-103."

Bad alternatives:

- "Try lots of improvements at once."
- "Refactor everything."
- "Make the tests pass somehow."

Keep alternatives narrow enough that their result is interpretable.

## Todo Template

Create a `research.todo.md` before implementing. Use `[ ]` boxes and update them
as work finishes.

Template:

```md
# <Name> Research TODO

Status: planned.
Final evaluation: `<path>/research/eval.md`.

## Top-Level Work

- [ ] Complete the baseline pass.
- [ ] Implement and evaluate <N> alternatives for <SPI/topic>.
- [ ] Write the final cross-alternative `eval.md`.
- [ ] Record failed strict gates instead of hiding them.
- [ ] Promote the winning design into canonical files, if promotion is part of
  this research.

## Baseline

- [ ] Create `research/baseline/`.
- [ ] Create `baseline/README.md`.
- [ ] Create `baseline/eval.md`.
- [ ] Verify current canonical modules.
- [ ] Run current client/runtime tests.
- [ ] Paste command results into `baseline/eval.md`.
- [ ] Score the baseline using the strict scoring gate.
- [ ] Identify baseline weaknesses that alternatives must address.

## Shared Artifact Gate

Every alternative folder below contains:

- [ ] `README.md`
- [ ] `spec.md`
- [ ] `Kernel.sr9`
- [ ] `examples/`
- [ ] `proofs/`
- [ ] `test/`
- [ ] `notes.md`
- [ ] `eval.md`
- [ ] local actor fixture config
- [ ] TypeScript client tests
- [ ] generated actor fixtures inside the alternative folder

## Alternatives

### ALT-A: <Name>

- [ ] Create `research/<alt_folder>/`.
- [ ] State the thesis in `spec.md`.
- [ ] Define kernel predicates.
- [ ] Add kernel lemmas/proof observers.
- [ ] Build at least one realistic actor example.
- [ ] Use the kernel in public actor `ensures`.
- [ ] Add TS tests for the main client workflow.
- [ ] Add TS tests for failure/authorization/guard cases.
- [ ] Run verification.
- [ ] Run runtime tests.
- [ ] Write `eval.md`.
- [ ] Record limitations in `notes.md`.

Outcome: pending.

### ALT-B: <Name>

- [ ] Same artifact and gate list.

Outcome: pending.

## Cross-Alternative Evaluation

- [ ] Create `research/eval.md`.
- [ ] Include baseline score table.
- [ ] Include every alternative in the score table.
- [ ] Choose winner and runner-up.
- [ ] List rejected alternatives with reasons.
- [ ] State canonical decisions.
- [ ] List files to promote.
- [ ] List evidence to retain.
- [ ] Include remaining verifier limitations.
- [ ] Include remaining client usability concerns.
- [ ] Include simplest viable canonical design.
- [ ] Include accepted and rejected complexity.
- [ ] Include next implementation step.

## Final Done Criteria

- [ ] Every alternative has a kernel.
- [ ] Every alternative has examples.
- [ ] Every alternative has tests.
- [ ] Every alternative has proofs.
- [ ] Every alternative has notes.
- [ ] Every alternative has a per-alternative eval.
- [ ] Every passing alternative has verification command logs summarized.
- [ ] Every passing alternative has runtime command logs summarized.
- [ ] Every failing alternative explains exactly why it failed.
- [ ] Every failing alternative classifies the failure.
- [ ] `research/eval.md` picks the best design.
- [ ] `research/eval.md` gives a concrete canonical migration plan.
- [ ] No generated fixtures are outside their alternative fixture directory.
- [ ] Remaining limitations and follow-up items are documented explicitly, not
  hidden as unfinished artifacts.
```

## Alternative README Template

````md
# <SPI> Alternative <A/B/C>: <Name>

This alternative tests <one-sentence thesis>.

## Run

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify <kernel>
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify <actor>
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify <proofs>
```

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=<alt>/test/config.json bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=<alt>/test/config.json bun run shared/harness/runner/runE2E.ts
```
````

Keep the README operational. Put judgments in `eval.md`, not the README.

## Alternative Spec Template

```md
# <Alternative> Spec

Thesis:

Public surface:

- `<public_method_1>`
- `<public_method_2>`

Semantic laws:

- Law 1
- Law 2
- Law 3

Kernel responsibilities:

- Predicate/lemma 1
- Predicate/lemma 2

Actor responsibilities:

- Public `ensures` must expose ...
- Local state must maintain ...

Client expectations:

- Client can ...
- Client can recover from ...

Tradeoffs:

- Added complexity:
- Rejected complexity:
```

The spec should say what the alternative promises before the code tries to
prove it.

## Kernel Rules

The kernel should carry reusable proof logic, not actor-specific storage.

Put in the kernel:

- public binding predicates;
- authorization predicates;
- receipt/quote acceptance predicates;
- guard acceptance predicates;
- conservation hooks;
- scalar/projection lemmas;
- small helper constructors when they reduce mistakes.

Do not put in the kernel:

- actor balances;
- protocol-specific storage maps;
- business-specific constants;
- large trusted shortcuts;
- unrelated app helpers.

When a helper starts appearing in multiple actors, move it into the kernel only
if it is semantic, not just convenient.

## Example Actor Rules

Examples must be realistic enough to stress the seed.

Each example actor should:

- expose the public SPI functions clients will actually call;
- use the kernel predicates in public `ensures`;
- include both success and failure paths;
- use real local state, not only constant returns;
- include setup helpers only for tests, and make those helpers explicit;
- prove local invariants close to the mutation;
- avoid hiding protocol behavior behind `trusted`.

For SPI-style work, actors should be small but not toy-only. A DEX example and a
DAO/staking example exposed different weaknesses; both were useful.

## Proof Observer Rules

Proof observers are small modules that call the kernel lemmas directly. They
serve three purposes:

- prove that kernel predicates imply the facts clients/actors need;
- keep actor examples cleaner;
- expose verifier regressions early.

Observer template:

```motoko
import Kernel ".../Kernel";
import Types ".../Types";

module {
  public lemma acceptedReceiptHasGuard(...) : ()
    requires Kernel.receiptAccepted(...);
    ensures Kernel.guardAccepts(...);
  {};
}
```

Use lemmas when the observer is proof-only. Use pure functions only when the
result is a real value the code should compute.

## Client Test Rules

Client tests are not optional. They answer whether the SPI shape is usable from
outside the canister.

Tests should cover:

- authorized success path;
- unauthorized rejection;
- discovery/wallet response shape;
- quote/request binding;
- execute/receipt binding;
- guard/slippage/deadline failures;
- failed execution does not mutate visible state;
- pagination or multi-entry reconstruction when relevant;
- retry/idempotency when relevant;
- protocol-specific edge cases.

Tests should assert client-visible details, not only that calls return `ok`.
For SPI-102, tests checked that every edge referenced known discovered nodes.
That caught a real client usability requirement.

## Strict Gate

Score every alternative from 1 to 5 in these categories:

```md
| Category | Score | Evidence |
|---|---:|---|
| security |  |  |
| provability |  |  |
| client usability |  |  |
| implementability |  |  |
| kernel usefulness |  |  |
| simplicity |  |  |
| cleanliness |  |  |
| extensibility |  |  |
| footgun resistance |  |  |
| runtime coverage |  |  |
| verifier ergonomics |  |  |
```

Use evidence, not vibes. A score should point to verified code, tests, or a
documented limitation.

## Occam Gate

Every alternative must pass an Occam check:

- What is the simplest design that could satisfy the same client/proof need?
- Did we try that simpler path?
- If we kept complexity, what did it buy?
- If we rejected complexity, where is that recorded?

This prevented operation ids and guard reason variants from being promoted too
early as mandatory base features.

## Eval Template

````md
# <Alternative> Evaluation

Status: pass/fail/partial.

## Scores

<score table>

## Occam Analysis

<simplest viable path and why this alternative does/does not exceed it>

## Command Results

Verification:

```bash
<commands>
```

Result: ...

Runtime:

```bash
<commands>
```

Result: ...
Report: ...

## Limitations

- ...

## Recommendation

Promote / retain as extension / reject / regrow.
````

If verification fails, do not soften it. Say exactly which file failed and
whether the failure is:

- semantic bug;
- missing proof;
- verifier limitation;
- backend cancellation;
- intentionally trusted test/mock behavior.

## Notes Policy

Use `notes.md` to record experience, not conclusions. Good notes include:

- verifier limitations;
- failed approaches;
- minimal repro shapes;
- why a workaround was chosen;
- what should improve in SR9;
- where not to overfit the spec to the verifier.

Do not rewrite the kernel into something ugly just to satisfy the verifier. If
the clean design is right but the verifier cannot prove it yet, record the
limitation and use the smallest honest workaround.

## Trusted Policy

Trusted code is allowed in research only if it is named, localized, and
explained.

Acceptable trusted uses:

- mock actor methods that intentionally reject/trap;
- small model bridge helpers;
- temporary verifier workarounds with explicit postconditions;
- DTO construction wrappers when the backend cancels and behavior is tested.

Unacceptable trusted uses:

- hiding core protocol accounting;
- claiming uniqueness/conservation without a proof or test;
- turning a failed gate into a pass without documenting it.

Every trusted helper should appear in `notes.md` or `eval.md`.

## Verification Commands

Use targeted verification while iterating:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify <file>
```

Use longer deterministic runs for files that previously hit backend issues:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi ./reference/dex/spi --cores 1 --verify-timeout-ms 120000 --deterministic --verify <file>
```

For client harnesses:

```bash
cd reference/dex
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 XDG_CACHE_HOME=/tmp/sector9 E2E_CONFIG=<config> bun run shared/harness/scripts/buildActorFixture.ts --all
E2E_CONFIG=<config> bun run shared/harness/runner/runE2E.ts
```

Paste summarized command results into `eval.md`. Do not rely on memory.

## Promotion Rule

Promote only the smallest design that passes the strict gate.

Promotion can include:

- the winning kernel;
- selected lemmas from a runner-up;
- optional extension profiles.

Promotion should not include:

- every feature from every alternative;
- storage implementation details unless they are part of the spec;
- optional UX features unless the base API commits to them.

In the SPI research:

- SPI-101 promoted the 101-A kernel plus selected 101-C cursor laws.
- SPI-102 promoted 102-A and kept guard reasons as an optional/profile idea.
- SPI-103 promoted 103-A and kept operation ids as an optional extension.

## Final Cross-Eval Template

```md
# <Research> Evaluation

Status:

## Score Summary

| Area | Alternative | Status | Security | Provability | Client UX | Simplicity | Runtime | Verifier |
|---|---|---|---:|---:|---:|---:|---:|---:|

## Winners

<winner, runner-up, reason>

## Canonical Decisions

<what changes in the canonical spec/kernel>

## Promotion Applied

<files promoted and verification status>

## Retain As Evidence

<tests, notes, failed attempts>

## Verifier Limitations

<honest list>

## Client Findings

<what a client needs from the API>

## Simplest Viable Canonical Design

<Occam result>

## Next Step

<concrete next implementation/research step>
```

## Research Completion Checklist

A research pass is complete only when:

- all alternatives have the shared artifact set;
- every alternative has at least one realistic example;
- client tests run through the harness;
- verification was attempted for every kernel/proof/example;
- failures are classified and documented;
- the final eval chooses a winner;
- canonical promotion is either applied or explicitly deferred;
- stale generated files are contained;
- no unchecked boxes remain unless they are explicitly explained as follow-up;
- the final status line matches the actual checklist.

## Lessons From The SPI Run

The most useful habits were:

- build multiple alternatives instead of arguing abstractly;
- force every alternative through client tests;
- keep kernel predicates small and semantic;
- move repeated proof facts into lemmas;
- use proof observers to keep actors clean;
- write limitations immediately while the failure is fresh;
- prefer simpler graphs first, then grow complexity;
- score with evidence;
- promote only what survived verification and client use.

The strongest signal came from examples that were slightly uncomfortable:

- DAO pending transitions forced SPI-102 to handle non-immediate state.
- Guard reason tests showed client recovery needs.
- Real awaited mock-ledger calls exposed unsound pre-await reasoning.
- Operation ids showed useful UX but too much base-spec complexity.
- Projection-key proofs gave a clean workaround for generic uniqueness without
  lying about record-array limitations.

That is the point of this process: make the seed grow in different soils, then
keep the simplest plant that actually lives.
