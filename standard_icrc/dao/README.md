# Sector9 DAO Demo

This is a standalone DAO demo written in Sector9.

## Executive Summary

This DAO holds real ICRC governance tokens in the DAO canister account and
tracks each subject's deposited balance locally. A subject can be a direct
principal or an SPI-100 virtual principal controlled by the caller. Users
deposit through the SPI-101 ICRC-2 flow, stake deposited tokens, wait 7 days for
voting power to mature, and then create or vote on governance proposals. Up to
32 proposals can be created in this bounded demo, and they can be open or
passed at the same time.
Creating a proposal reserves a bond equal to the current proposal threshold from
the proposer's active stake; failed proposals slash that bond from local DAO
accounting, and passed proposals return it when executed. Voting uses mature
active stake, and stake used to vote remains locked from unstaking while any
voted proposal is open. Proposal bonds cannot reuse stake that is already
needed by an open-vote lock.

Withdrawals send real tokens back through the SPI-101 ICRC-1 flow. The DAO
moves `amount + fee` into pending withdrawal state before the ledger transfer,
finalizes on success, and restores the pending debit on ledger errors or ledger
call rejects under the SPI-101 guaranteed-response model. A separate
`WithdrawalOps` module keeps the one-in-flight-withdrawal guard outside the main
DAO accounting state.

The checked core preserves local accounting conservation, stake and unstake
movement, voting-lock behavior, proposal deadlines, config bounds, bounded
proposal storage, config-version sequencing, and withdrawal pending-state
bookkeeping.
Scalar proposal lifecycle rules, the DEX-style multi-proposal book, the DAO
accounting module, and the withdrawal-operation module verify independently. The
remaining production assumptions are operational: the configured governance
ledger is trusted, users deposit through the DAO flow, direct token transfers
are unsupported, and deployment/upgrade/reconciliation procedures are outside
this demo.

## How It Works

`DaoActorDemo` is deployed with:

- `governanceLedger`
- `initialQuorumVotes`
- `initialProposalThreshold`

There is no initial token allocation. The DAO starts with zero accounted tokens.
Users bring real governance tokens into the DAO with the SPI-101 deposit flow:
`spi_101_deposit({ subject; ledger; from; amount })`.

The `subject` is the local DAO account owner. It can be the caller's direct
principal or an SPI-100 virtual principal controlled by the caller. This lets a
canister or other short principal safely partition DAO balances and governance
state into multiple local accounts without a stateful registry.

Deposits use ICRC-2:

- The user first approves the DAO canister on the `governanceLedger`.
- `spi_101_deposit` calls `icrc2_transfer_from`.
- The governance ledger is the only supported external ledger.
- Each deposit call includes a DAO operation memo and `created_at_time`.
- Tokens are pulled from `request.from` into the DAO canister's default
  account. `request.from.owner` must equal the caller.
- The subject's DAO liquid balance is credited only after the ledger returns
  `#Ok(txIndex)`.
- A duplicate ledger response is not credited without a matching local deposit
  operation record.
- Ledger errors or rejects do not credit local DAO balance.

Withdrawals use ICRC-1:

- `spi_101_withdraw({ subject; ledger; to; amount })` can spend only the
  subject's liquid DAO balance.
- The governance ledger is the only supported external ledger.
- The actor queries `icrc1_fee()`.
- The DAO debits `amount + fee` into a pending withdrawal before the transfer.
- The in-flight withdrawal call includes a DAO operation memo and
  `created_at_time`.
- The actor calls `icrc1_transfer` to `request.to`, including its optional
  subaccount.
- On success, the pending debit is finalized.
- A duplicate ledger response is treated as success using the duplicate
  transaction index.
- Ledger errors and ledger call rejects restore the full pending debit to
  liquid under the SPI-101 guaranteed-response model.
- `WithdrawalOps` stores the withdrawal operation id, memo timestamp, amount,
  fee, and debit separately from the main DAO state.
- A user can have only one pending withdrawal operation at a time.

Voting power still requires staking:

- `stake(subject, amount)` moves liquid deposited tokens into active stake.
- Staked tokens cannot vote immediately. `stake(subject, amount)` sets the subject's
  `votingPowerUnlockAt` to `now + 7 days`.
- `create_proposal(subject, action)` and `vote(subject, id, choice)` both
  require the subject's
  active stake lock to be mature.
- `voting_power(user)` returns mature active stake and reports `0` while the
  7-day voting lock is active; `stake_info(user)` includes
  `votingPowerUnlockAt`.
- `request_unstake(subject, amount)` removes voting power immediately and
  starts the 7-day cooldown, except stake already used to vote stays locked
  while any voted proposal is open.
- `claim_unstaked(subject)` moves matured pending unstake back to liquid
  balance.
- Only claimed liquid balance can be withdrawn.

The 7-day cooldown is:

```sector9
604_800_000_000_000
```

Quorum and proposal thresholds are absolute token amounts. Initial zero values
are normalized to `1`. Governance config actions must keep both values nonzero
and no larger than the DAO's current accounted token supply when the proposal is
created.

Proposals have a fixed 3-day voting period.
`create_proposal(subject, action)` stores the creation time and deadline,
`vote(subject, id, choice)` rejects once that deadline has been reached, and
`close(id)` rejects attempts before the deadline. A proposal passes only when
yes votes exceed no votes, configured quorum is met, and participation is
strictly more than 3% of the proposal's snapshot active stake. Otherwise close
marks it failed and burns the reserved bond locally.

Each proposal captures the current `configVersion` at creation. Execution
applies a passed proposal only if that version still matches the DAO's current
config version, then increments the config version by exactly `1`. If a newer
config proposal executed first, the older passed proposal settles as `#stale`:
its bond is returned, the config is not changed, and it cannot overwrite the
newer config. Ordinary token-supply changes, such as withdrawals, do not make a
previously valid passed proposal unexecutable.

## Public Actor API

`DaoActorDemo.sr9` exposes:

- `governance_ledger()`
- `proposal_config()`
- `config_version()`
- `dao_totals()`
- `next_proposal_id()`
- `max_proposals()`
- `proposal_window()`
- `voting_power(user)`
- `stake_info(user)`
- `pending_withdrawal(user)`
- `proposal(id)`
- `vote_info(id, user)`
- `spi_101_deposit(request)`
- `spi_101_withdraw(request)`
- `spi_101_balance(request)`
- `stake(subject, amount)`
- `request_unstake(subject, amount)`
- `claim_unstaked(subject)`
- `create_proposal(subject, action)`
- `vote(subject, id, choice)`
- `close(id)`
- `execute(id)`

State-changing methods delegate to `lib/Dao.sr9`; scalar proposal lifecycle
rules live in `lib/Proposal.sr9`, bounded multi-proposal storage lives in
`lib/ProposalBook.sr9`, and withdrawal recovery delegates to
`lib/WithdrawalOps.sr9`. The proposal book follows the DEX registry pattern:
`Dao.State` owns an immutable opaque proposal-book handle whose internals mutate
through verified module functions.

## What Was Verified And Proven

The DAO state is opaque. Its public model tracks:

- governance ledger
- local ledger-backed accounted token total
- liquid balance total
- active stake total
- pending unstake total
- pending withdrawal total
- reserved proposal-bond total
- next proposal id
- quorum and proposal-threshold config

The main accounting invariant is:

```text
totalLiquid + totalActiveStake + totalPendingUnstake + totalPendingWithdraw
  + totalProposalBonds == totalSupply
```

Here `totalSupply` means the DAO's local ledger-backed accounting total, not
the external ledger's global token supply.

The verified and checked contracts cover:

- initialization starts with zero local token allocation
- withdrawal operation initialization starts with zero pending withdrawal amount
- successful deposits increase local accounted tokens and liquid balance
- deposit ledger arguments are constructed so `icrc2_transfer_from` pulls from
  the requested ICRC account into the DAO canister's default account and
  includes a non-null memo and `created_at_time`
- deposit ledger errors/rejects, including duplicate responses, preserve local
  accounting
- withdrawal begin moves `amount + fee` from liquid into pending withdrawal
- withdrawal ledger arguments are constructed so `icrc1_transfer` sends to the
  requested ICRC account, with no source subaccount, and includes the pending
  withdrawal memo and `created_at_time`
- withdrawal success settles the pending debit and reduces accounted tokens
- ledger transfer errors and ledger call rejects restore the pending debit to
  liquid under the SPI-101 guaranteed-response model
- pending withdrawal metadata exposes the stored operation id, amount, fee,
  debit, and `created_at_time`
- clearing a withdrawal operation decreases the pending withdrawal-operation
  total by exactly that debit
- withdrawal never decreases active stake or pending unstake, so locked voting
  tokens cannot be withdrawn around the 7-day lock
- staking preserves the local accounted token total
- successful staking decreases the subject's liquid balance by exactly `amount`
  and increases active stake by exactly `amount`
- successful staking sets the subject's voting unlock time to exactly
  `now + 7 days`
- eligible voting power is zero before the subject's voting unlock time and
  equals active stake after it
- successful proposal creation and successful voting prove
  `now >= votingPowerUnlockAt`
- unstake requests remove active voting power and move tokens into pending
  unstake
- successful unstake requests set the unlock time to exactly `now + 7 days`
- claims move matured pending unstake back to liquid
- successful claims move exactly the matured pending-unstake amount into liquid
  and clear the subject's pending unstake
- scalar proposal creation stores the creation time and a deadline exactly
  3 days later
- voting rejects at or after the stored proposal deadline
- scalar proposal close enforces the deadline, quorum, yes > no, and >3%
  participation rule
- proposal creation reserves the current proposal-threshold bond from active
  stake into proposal-bond accounting
- proposal creation rejects when the proposal bond would drop the proposer
  below stake already locked by open votes
- failed proposal close burns the reserved bond locally by reducing
  `totalProposalBonds` and `totalSupply`
- passed proposal execution returns the reserved bond to the proposer's active
  stake
- proposal receipts expose the config version captured at proposal creation
- applied execution increments config version by exactly `1`
- stale execution returns the proposal bond while preserving the current config
  and config version
- the proposal book has a fixed lifetime capacity of 32 proposals
- multiple proposals can be open or passed at the same time
- successful voting proves the voter had not already voted on that proposal,
  marks that voter/proposal pair as voted, and changes proposal totals by
  exactly the receipt weight once
- successful voting locks the exact vote weight against unstaking while that
  proposal is open; with multiple open proposals, the reusable-stake lock is the
  maximum open voted weight for the user
- successful deposits, withdrawal staging/success, staking, unstaking,
  claiming, and the shared withdrawal-failure restore step preserve every other
  account key's liquid, active-stake, voting-lock, pending-unstake, and
  pending-withdraw state
- voting and close preserve token balances except failed close burns the
  proposal bond; creation and execution move the proposer's stake between active
  stake and proposal-bond accounting
- config validity keeps quorum and proposal-threshold values nonzero
- governance config actions cannot set quorum or proposal-threshold values
  above the DAO's accounted token supply at proposal creation

`Dao.sr9` keeps rich per-user contracts on private implementation functions and
uses public wrappers with import-safe aggregate contracts. The actor follows the
DEX example's boundary style: deep DAO accounting invariants stay in the DAO
module, while the actor keeps only the lightweight withdrawal-operation
invariant across ledger awaits.

`Types.sr9`, `WithdrawalOps.sr9`, `Proposal.sr9`, `ProposalBook.sr9`, and
`Dao.sr9` verify independently. `proofs/DaoObservers.sr9` verifies the external
observer proof attempts for deposit, withdraw begin/success/reject, staking,
unstaking, claiming, voting, and execution preservation properties.
`DaoActorDemo.sr9` also verifies and compiles to Wasm.

## Verification Commands

The latest published image was pulled before verification:

```bash
docker pull ghcr.io/neutrinomic/sr9:latest
```

The image digest used was:

```text
sha256:f5cef482c5ad738582453f1e7f3a1096bbbf1b7b7e5da947f8f468e48c2df03c
```

Commands used:

```bash
SR9_IMAGE='ghcr.io/neutrinomic/sr9@sha256:f5cef482c5ad738582453f1e7f3a1096bbbf1b7b7e5da947f8f468e48c2df03c'
SR9=(docker run --rm -e XDG_CACHE_HOME=/tmp/sector9 --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work "$SR9_IMAGE")

"${SR9[@]}" --check lib/Types.sr9 lib/WithdrawalOps.sr9 lib/Proposal.sr9 lib/ProposalBook.sr9 lib/Dao.sr9 proofs/DaoObservers.sr9 DaoActorDemo.sr9
"${SR9[@]}" --verify --deterministic --cores 1 --verify-timeout-ms 600000 lib/Types.sr9
"${SR9[@]}" --verify --deterministic --cores 1 --verify-timeout-ms 900000 lib/WithdrawalOps.sr9
"${SR9[@]}" --verify --deterministic --cores 1 --verify-timeout-ms 600000 lib/Proposal.sr9
"${SR9[@]}" --verify --deterministic --cores 1 --verify-timeout-ms 600000 lib/ProposalBook.sr9
"${SR9[@]}" --verify --deterministic --cores 1 --verify-timeout-ms 600000 lib/Dao.sr9
"${SR9[@]}" --verify --deterministic --cores 1 --verify-timeout-ms 1200000 proofs/DaoObservers.sr9
"${SR9[@]}" --verify --deterministic --cores 1 --verify-timeout-ms 1200000 DaoActorDemo.sr9
```

The actor compiles with:

```bash
"${SR9[@]}" -c DaoActorDemo.sr9 -o /tmp/DaoActorDemo.wasm
```

Source scan:

```bash
rg -n "trusted" . --glob '*.sr9'
```

No trusted Sector9 source was found.

## Runtime E2E Tests

The DAO is also tested as deployed Wasm with PocketIC and a standard ICRC ledger
fixture. The latest local DAO run passed:

```text
Suites: 12 ok, 0 fail
Tests: 50 ok, 0 fail, 0 skipped
```

Run from the repository root:

```bash
bun run typecheck
bun run build:dao
bun run test:dao
```

The default DAO run excludes `.slow.` specs. The slow performance-style stress
gate is:

```bash
bun run test:dao:slow
```

By default it populates 1000 users, creates up to the demo's 32 lifetime
proposals in waves, then runs 3000 mixed deposit/stake/unstake/claim/withdraw
and query actions before checking DAO totals, config version, sampled account
state, and the real ICRC balance held by the DAO canister. For quick local
validation, scale it down with:

```bash
E2E_DAO_STRESS_USERS=20 E2E_DAO_STRESS_PROPOSALS=8 \
E2E_DAO_STRESS_ACTIONS=80 E2E_DAO_STRESS_VOTERS=8 bun run test:dao:slow
```

The runtime suites cover:

- lifecycle basics: deployment, deposit, stake, proposal creation, vote, close,
  and execute
- deposit security: no local credit on failed or rejected ledger transfer-from
  paths
- withdrawal security: local debit before transfer, transfer-error/reject
  refund, one-operation pending guard, and stopped-ledger fee failure behavior
- staking locks: voting-power maturity, cooldowns, one pending unstake,
  multi-proposal vote locks, and proposal-bond rejection when stake is already
  backing an open vote
- proposal security: double-vote rejection, deadline ordering, failed-bond burn,
  passed-bond return, execution once, and invalid config action rejection
- quorum and participation: quorum thresholds, yes/no outcomes, and the strict
  >3% participation boundary
- liveness probes: withdrawals cannot invalidate already-passed config
  proposals, and stale passed proposals settle without overwriting newer
  executed config
- SPI compliance: SPI-101 deposit/withdraw/balance, SPI-100 delegated subjects,
  ICRC subaccount withdrawal targets, unauthorized delegated-subject access, and
  virtual-ledger rejection
- edge-case probes: stale settlement cannot be replayed for a second bond
  return, new proposals capture the latest config version after stale
  settlement, threshold updates control future proposal bonds, failed bond burns
  lower the local supply boundary for future config actions, direct ledger
  surplus cannot satisfy DAO local supply checks, and extra stake after voting
  can fund new bonds only after rematurity and within open-vote lock bounds
- multi-identity scenarios: overlapping proposals keep vote locks isolated by
  voter, proposal bonds stay accounted per proposer through failed/applied/stale
  paths, liquid-only and immature-stake users cannot borrow voting power, and
  mixed liquid/staked/direct-transfer/withdrawal flows stay isolated while a
  proposal is open
- slow stress: many identities deposit, stake, create/vote/close/execute
  proposal waves, then churn through staking, unstaking, claiming, deposits,
  withdrawals, and account queries while preserving aggregate local accounting
  and the DAO canister's real ICRC balance
- mixed adversarial scenarios with multiple identities attempting blocked
  withdrawals, unstaking, duplicate votes, and malformed proposals
- view surfaces for empty accounts, proposal state, vote state, totals, and
  proposal-window monotonicity
- a scenario-model harness that tracks expected liquid balances, active stake,
  pending unstake, pending withdrawals, proposal bonds, proposals, votes, config
  version, and the external DAO ledger balance after each action

## Current Limits

- One governance ledger per DAO instance.
- SPI-101 supports ICRC subaccounts for deposit sources and withdrawal targets.
- No token transfers between DAO users.
- Adding more stake resets the subject's active-stake voting unlock time.
- No abstain vote and no vote replacement.
- No early close when an outcome is mathematically final; close is deadline-only.
- Proposal capacity is fixed at 32 lifetime proposals; the 33rd creation
  rejects.
- No execution actions beyond DAO config changes.
