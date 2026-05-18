# SR9 Verifier Wishlist From The DEX Demo

This file records the top verifier ergonomics improvements exposed while
building and verifying this DEX demo. These are not requests for DEX-specific
compiler behavior. They are generic SR9 capabilities that would make
protocol-scale verified applications cleaner, safer, and less dependent on
trusted proof cuts.

## 1. Verified Collection Enumeration Over Opaque-Owned Maps

The biggest improvement would be first-class support for verifying scans over
maps owned by opaque modules, including maps whose values are opaque handles.

What we want:

- iterate `BMap`/`MBMap` entries when values include opaque handles;
- prove read-only scans preserve the owner model;
- prove returned arrays/lists are complete snapshots of the intended entries;
- prove uniqueness or explicitly model duplicates;
- connect "sum over listed holders" to cached per-key totals.

Why it matters:

Real protocols often need bulk settlement paths: list all LP holders, list all
balances for a user, list all pools, return funds during shutdown, or prove that
no claim was skipped. Without ergonomic verified enumeration, those paths become
trusted even when the runtime code is straightforward.

What it would clean up here:

- owner-maintained key logs used only to avoid opaque iterator escape issues;
- duplicate-log reasoning where every scan rechecks live state;
- trusted listing and holder-discovery cuts;
- much of the proof difficulty around pool removal and ledger retirement
  cleanup.

The ideal outcome is that a module can expose a verified listing API with clear
completeness and framing guarantees, while still keeping its opaque
representation abstract to clients.

## 2. Stronger Compositional Opaque-Owner Framing

OP4 and OP6 gave us the right proof model for opaque handles, child projection,
owner transactions, and imported summaries. The remaining wish is for those
features to compose more naturally in larger state trees.

What we want:

- parent opaque records can own several child opaque handles without losing
  frame facts after mutating one child;
- constructors for opaque records with nested handles can prove model
  postconditions without special workarounds;
- same-owner methods can call their own public observers/helpers without losing
  `Owned$Opaque$...` permission;
- imported child observer summaries stay usable without leaking predicate
  bodies;
- actor storage preserves ownership for immutable opaque fields without
  requiring dummy mutable witnesses.

Why it matters:

A real protocol wants to decompose state into modules: balances, ledgers,
pools, pending operations, accounting, and indexes. If parent/child opaque
ownership is difficult to frame, implementers are pushed toward flatter,
less-modular representations just to help the verifier.

What it would clean up here:

- raw `BMap` fields used where a child opaque module would be cleaner;
- weakened observer postconditions over nested opaque children;
- public-helper self-call avoidance inside owner modules;
- top-level owner-frame proof cuts, especially around pool removal;
- dummy mutable witness fields needed only to preserve actor-stored ownership.

The ideal outcome is that SR9 lets us write the protocol architecture we would
choose for maintainability, and then prove it compositionally through typed
opaque summaries.

## 3. Modular Async/Await Proof Support For Protocol Helpers

The DEX actor currently performs external ledger awaits directly and calls
synchronous local `begin`/`finish` transitions around them. That verifies, but
it is not the cleanest architecture.

What we want:

- imported/private `async*` helpers that can perform `await`;
- safe internal passing of opaque state capabilities through async protocol
  helpers;
- explicit begin/commit/rollback phase contracts around awaits;
- framing rules that make actor interleaving visible and prevent invalid
  `old(...)` claims across suspension points;
- diagnostics that explain when an async contract is invalid because of actor
  reentrancy or shared-boundary restrictions.

Why it matters:

Protocols with external calls naturally want a separate module for remote
operations. For this DEX, ledger operations would ideally live in a ledger ops
module, while the actor remains thin orchestration and the DEX state module
remains purely local accounting.

What it would clean up here:

- ledger-call code embedded directly in the actor;
- duplicated begin/await/finish wiring across deposit, withdraw, add-ledger,
  and forced-return flows;
- architecture driven by current async verifier limits rather than by the
  protocol boundary;
- weaker actor-level postconditions caused by necessary interleaving caution.

The ideal outcome is a proof-friendly async protocol pattern: local pre-state
transition, remote await, success or failure settlement, and explicit recovery
guarantees, all factored through reusable modules without weakening
reentrancy safety.

## Summary

The three most valuable verifier improvements are:

1. verified collection enumeration over opaque-owned maps;
2. stronger compositional framing for nested opaque owners;
3. modular async/await proof support for protocol helper modules.

Together, these would remove most of the remaining trusted cuts and proof-shaped
runtime structure from this demo while preserving the same safety model.
