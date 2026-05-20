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

- `100/` drafts reserved virtual-principal encoding rules for protocol
  assets that need principal keys but must not collide with real IC users,
  canisters, or ledgers.
- `101/` drafts the shared deposit, withdraw, and balance surface for
  canisters that hold local balances backed by ICRC ledgers.

When used as an SR9 package, map the package name `spi` to this folder. For
example:

```bash
sector9 --package core ./core/src --package spi ./spi --verify my_actor.sr9
```

Then protocol modules can import SPI definitions by stable package path:

```motoko
import VirtualPrincipal "mo:spi/100/VirtualPrincipal";
```
