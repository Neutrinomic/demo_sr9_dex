# Fresh DAO Verification Notes

## Actor-level VPR generation issue

The support modules verify on their own:

- `lib/AccountBook.sr9`
- `lib/DaoUtils.sr9`

The fresh actor also compiles and passes the PIC client tests, but direct
actor verification currently fails after translation to Viper with generated VPR
type errors:

- `wrong number of type arguments` on imported `AccountBook.orderedNat`,
  `orderedInt`, and `orderedNat4` wrapper specs over `BMap`.
- record/option type errors around `DaoUtils.nodeShape` only when the utility
  module is pulled through `DaoActorDemo.sr9`.

Minimal repro shape:

1. Put ordered `BMap` invariants behind small imported wrapper functions.
2. Use those wrapper functions as actor invariants.
3. Pull in a utility that constructs a record with optional fields.
4. Verify the actor, not just the utility modules.

This looks like a translator/VPR typing issue rather than an actor proof issue,
because the modules verify independently and the actor compiles cleanly. I did
not weaken the actor invariants or inline the utility functions to work around
this, because that would make the DAO code uglier and less representative of the
kernel/module style we want.

Suggested SR9 improvements:

- Preserve generic type arguments for imported module function specs when they
  are referenced from actor invariants.
- Add a regression test for imported ordered `BMap` wrapper predicates used in a
  persistent actor invariant.
- Add a regression test for imported record constructors with optional fields
  used from an actor method body.
- Improve the source mapping for generated VPR type errors so the failing SR9
  signature and instantiated type arguments are shown directly.
