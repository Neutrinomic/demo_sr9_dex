# SR9 Protocol Interface

`spi/` is where we will define SR9 Protocol Interfaces: reusable interface
definitions for protocols, plus the behavioral rules clients and
implementations should rely on.

These interfaces are not full protocol implementations. They are meant to
describe the public surface of a protocol clearly enough that:

- application actors can import and call compatible protocol actors;
- protocol implementations can prove they satisfy the expected behavior;
- clients can understand what each function means, what errors represent, and
  which state transitions are promised;
- tests can target the interface instead of a single concrete implementation.

An SPI should include:

- actor interface types;
- request, response, and error types;
- comments explaining what each endpoint does;
- required preconditions and expected failure cases;
- postconditions or guarantees that clients can safely build around;
- notes about async boundaries, retries, idempotency, and reconciliation;
- assumptions about external canisters such as ledgers, DAOs, or token modules.

The goal is to make interface compatibility explicit. Implementations may vary
internally, but if they claim an SPI, they should expose the same endpoint
shape and preserve the documented semantics.

Future interfaces can include DEX, DAO, vault, ledger adapter, token, treasury,
and governance surfaces.

## Interfaces

- `100/` defines compact local account ids: account blobs that decode to
  `{ wallet : Principal; id : Nat }`, plus a checksummed Base58 text form.
- `101/` defines the shared wallet surface for canisters that hold
  account-local assets and protocol positions.
- `102/` drafts the discover, quote, execute model: protocols expose a graph
  of typed transitions, clients quote one edge, and execution applies it under
  caller acceptance limits.
- `103/` defines bridge profiles for moving external assets into and out of
  SPI-101 wallet holdings. The first profile is ICRC deposit/withdraw.

`seed-research.md` evaluates the current SPI-100, SPI-101, SPI-102, and SPI-103 seeds
against the examples and client harnesses grown from them.

When used as an SR9 package, map the package name `spi` to this folder. For
example:

```bash
sector9 --package core ./core/src --package spi ./spi --verify my_actor.sr9
```

Then protocol modules can import SPI definitions by stable package path:

```motoko
import AccountCodec "mo:spi/100/AccountCodec";
```
