# Standard ICRC References

This folder contains protocol projects that use standard ICRC ledgers as their
external asset layer.

The shared design is:

1. Users deposit through the standard ledger flow.
2. The protocol credits a local balance only after the ledger call succeeds.
3. Swaps, liquidity, governance, vault accounting, and other protocol actions
   operate on local balances.
4. Withdrawals move funds back through the standard ledger boundary.

That structure keeps inter-canister async behavior out of the core protocol
logic where possible. Protocol modules can prove local accounting guarantees
without threading every business operation through an external ledger await.

The current project is `dex`. Later projects can include DAO, vault, and other
standard-ICRC protocols using the same boundary pattern.
