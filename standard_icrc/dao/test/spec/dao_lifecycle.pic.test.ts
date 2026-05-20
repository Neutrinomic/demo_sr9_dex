import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import { balanceOf } from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  approveAndDeposit,
  DEFAULT_INITIAL_BALANCE,
  type DaoE2E,
  PROPOSAL_PERIOD_SECONDS,
  setupDaoE2E,
  stake,
  VOTING_LOCK_SECONDS,
} from "./daoTestEnv.ts";

describe("dao lifecycle basics", () => {
  let env: DaoE2E;

  beforeEach(async () => {
    env = await setupDaoE2E();
  });

  afterEach(async () => {
    await env.runtime.tearDown();
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("deploys with the configured governance ledger and empty local accounting", async () => {
    expect((await env.dao.actor.governance_ledger()).toText()).toBe(
      env.ledger.canisterId.toText(),
    );
    expect(await env.dao.actor.proposal_config()).toEqual({
      quorumVotes: 1n,
      proposalThreshold: 1n,
    });
    expect(await env.dao.actor.config_version()).toBe(0n);
    expect(await env.dao.actor.dao_totals()).toEqual({
      totalSupply: 0n,
      totalLiquid: 0n,
      totalActiveStake: 0n,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 0n,
    });
    expect(await env.dao.actor.next_proposal_id()).toBe(0n);
    expect(await env.dao.actor.max_proposals()).toBe(32n);
    expect(await env.dao.actor.proposal_window()).toEqual({
      nextProposalId: 0n,
      maxProposals: 32n,
    });
  });

  test("deposit and stake move real ICRC tokens into local DAO voting accounting", async () => {
    const amount = 250_000n;

    const deposit = unwrapOk<any>(await approveAndDeposit(env, env.alice, amount));
    expect(deposit.ledger.toText()).toBe(env.ledger.canisterId.toText());
    expect(deposit.amount).toBe(amount);
    expect(deposit.balanceAfter).toBe(amount);

    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(amount);
    expect(await balanceOf(env.ledger, env.alice)).toBe(
      DEFAULT_INITIAL_BALANCE - amount - env.ledger.fee - env.ledger.fee,
    );
    expect(await env.dao.actor.dao_totals()).toEqual({
      totalSupply: amount,
      totalLiquid: amount,
      totalActiveStake: 0n,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 0n,
    });

    const staked = unwrapOk<any>(await stake(env, env.alice, amount));
    expect(staked.amount).toBe(amount);
    expect(staked.liquidBalance).toBe(0n);
    expect(staked.activeStake).toBe(amount);
    expect(await env.dao.actor.stake_info(env.alice.getPrincipal())).toEqual({
      liquid: 0n,
      activeStake: amount,
      proposalBond: 0n,
      pendingUnstake: 0n,
      pendingWithdraw: 0n,
      activeVoteLock: 0n,
      votingPowerUnlockAt: [staked.votingPowerUnlockAt],
      unlockAt: [],
    });
    expect(await env.dao.actor.voting_power(env.alice.getPrincipal())).toBe(0n);

    await env.runtime.advanceSeconds(VOTING_LOCK_SECONDS + 1n, { ticks: 3 });
    expect(await env.dao.actor.voting_power(env.alice.getPrincipal())).toBe(amount);
  });

  test("mature stake can create, pass, and execute a config proposal", async () => {
    const amount = 250_000n;
    unwrapOk(await approveAndDeposit(env, env.alice, amount));
    unwrapOk(await stake(env, env.alice, amount));
    await env.runtime.advanceSeconds(VOTING_LOCK_SECONDS + 1n, { ticks: 3 });

    env.runtime.as(env.dao.actor, env.alice);
    const created = unwrapOk<any>(
      await env.dao.actor.create_proposal(env.alice.getPrincipal(), { setQuorum: 2n }),
    );
    expect(created.id).toBe(0n);
    expect(created.proposer.toText()).toBe(env.alice.getPrincipal().toText());
    expect(created.quorumVotes).toBe(1n);
    expect(created.snapshotActiveStake).toBe(amount - 1n);
    expect(created.configVersion).toBe(0n);

    const afterCreate = await env.dao.actor.stake_info(env.alice.getPrincipal());
    expect(afterCreate.activeStake).toBe(amount - 1n);
    expect(afterCreate.proposalBond).toBe(1n);

    const voted = unwrapOk<any>(
      await env.dao.actor.vote(env.alice.getPrincipal(), 0n, { yes: null }),
    );
    expect(voted.id).toBe(0n);
    expect(voted.voter.toText()).toBe(env.alice.getPrincipal().toText());
    expect(variantKey(voted.choice)).toBe("yes");
    expect(voted.weight).toBe(amount - 1n);
    expect(voted.yesVotes).toBe(amount - 1n);
    expect(voted.noVotes).toBe(0n);

    await env.runtime.advanceSeconds(PROPOSAL_PERIOD_SECONDS + 1n, { ticks: 3 });
    const closed = unwrapOk<any>(await env.dao.actor.close(0n));
    expect(variantKey(closed.status)).toBe("passed");
    expect(closed.yesVotes).toBe(amount - 1n);
    expect(closed.noVotes).toBe(0n);

    const executed = unwrapOk<any>(await env.dao.actor.execute(0n));
    expect(executed.id).toBe(0n);
    expect(executed.config).toEqual({
      quorumVotes: 2n,
      proposalThreshold: 1n,
    });
    expect(executed.applied).toBe(true);
    expect(executed.configVersion).toBe(1n);
    expect(await env.dao.actor.config_version()).toBe(1n);
    expect(await env.dao.actor.proposal_config()).toEqual({
      quorumVotes: 2n,
      proposalThreshold: 1n,
    });
    expect(variantKey((await env.dao.actor.proposal(0n))[0].status)).toBe(
      "executed",
    );
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(0n);
  });
});
