# SPI-102 Kernel Pattern Summary

## Approach

The current SPI-102 structure has three layers:

1. `Types.sr9` defines the interface data model: discovery graph, nodes, edges,
   quote, guard, receipt, and errors.
2. `Kernel.sr9` owns reusable behavior and proof predicates: authorization,
   quote binding, quote freshness, guard acceptance, executable checks, and
   successful receipt acceptance.
3. Protocol actors own their local state and business logic, then call the
   kernel before commit and expose public postconditions proving successful
   receipts satisfy the kernel acceptance predicate.

This keeps the SPI spec from becoming implementation code while still giving
protocol implementations a shared verification target.

## Verification Impact

The biggest improvement is on `execute`.

Instead of each protocol proving an ad hoc slippage and safety story, successful
execute results now prove:

```motoko
Kernel.receiptAccepted(caller, quote, guard, receipt)
```

That predicate covers:

- account authorization;
- positive quote flow;
- quote freshness at `receipt.executedAt`;
- receipt binding to the quote account and edge;
- guard acceptance at `receipt.executedAt`.

Guard acceptance includes the user-facing constraints that matter most for
execution safety: `minReceive`, `maxSpend`, `maxFee`, and `deadline`.

So the public actor method no longer only checks slippage internally. Its
contract states that every successful receipt satisfies the caller's guard.

## Benefits

- Clear separation of concerns: types are data, the kernel is reusable behavior,
  and protocol actors are concrete implementations.
- Reusable verification: once the kernel predicate is right, each protocol can
  prove against the same acceptance contract.
- Stronger client guarantees: callers can rely on a public `execute`
  postcondition for slippage and guard behavior.
- Better protocol development workflow: new protocols can focus on quote and
  commit logic while reusing kernel checks for common safety conditions.
- Useful spec pressure: the DEX and DAO examples exposed real design questions
  around discovery graphs, node identity, LP shares, pending unstake, quote
  freshness, and guard semantics.
- More realistic examples: account-indexed `BMap` state is closer to real
  canister storage than scalar demo balances.

## Assessment

This is a major improvement for the `execute` proof architecture. We moved from
"the implementation checks something" to "the public method proves every
successful receipt satisfies the caller guard."

The overall verification process is moderately improved today, not fully
automated, because some trusted islands remain:

- full `discover` graph construction still stresses the verifier backend;
- basket scans for guard containment are trusted;
- some BMap update wrappers and pro-rata LP withdrawal math still need trusted
  helpers or single-core verification.

The architecture looks right. The remaining work is to reduce those trusted
islands one at a time as SR9 proof support improves.
