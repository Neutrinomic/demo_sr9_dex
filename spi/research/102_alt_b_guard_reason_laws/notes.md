# Notes

- `basketAmount` and `basketContains` remain trusted due array scan proof
  limitations.
- `GuardReasonDaoActor.receiptForAt` is trusted for the same quote-to-receipt
  array permission limitation found in 102-A.
- Failed execute now leaves wallet-visible state unchanged; local execution time
  is committed only after quote freshness, guard, and balance checks pass.
- The actor uses one account-wide DAO balance set to keep the protocol-law hook
  easy to inspect.
- `GuardReasonDexActor.sr9` is the smaller protocol-law example: it verifies a
  fee-adjusted `dexConserves` assertion and keeps guard reason behavior in the
  same kernel profile.
- `GuardReasonDaoActor.sr9` now verifies after trimming the DAO graph to the
  two core transitions, `stake` and `request-unstake`, and keeping branch-local
  conservation assertions close to the state mutation.
- Guard reason ordering is now a verified API behavior: deadline is checked
  before min receive, max spend, and max fee.
