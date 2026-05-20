import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import {
  createProposal,
  depositStakeAndMature,
  type DaoE2E,
  setTimeNanos,
  setupDaoE2E,
  vote,
} from "./daoTestEnv.ts";

describe("dao view surfaces", () => {
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

  test("empty account and missing proposal views return stable defaults", async () => {
    expect(await env.dao.actor.stake_info(env.alice.getPrincipal())).toEqual({
      liquid: 0n,
      activeStake: 0n,
      proposalBond: 0n,
      pendingUnstake: 0n,
      pendingWithdraw: 0n,
      activeVoteLock: 0n,
      votingPowerUnlockAt: [],
      unlockAt: [],
    });
    expect(await env.dao.actor.voting_power(env.alice.getPrincipal())).toBe(0n);
    expect(await env.dao.actor.pending_withdrawal(env.alice.getPrincipal())).toEqual([]);
    expect(await env.dao.actor.proposal(999n)).toEqual([]);
    expect(await env.dao.actor.vote_info(999n, env.alice.getPrincipal())).toEqual({
      hasVoted: false,
      choice: [],
      voteWeight: 0n,
      lockedStake: 0n,
    });
  });

  test("proposal and vote views reflect create, vote, close, and execute states", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 2n }));
    let proposal = (await env.dao.actor.proposal(created.id))[0];
    expect(proposal.id).toBe(created.id);
    expect(proposal.proposer).toBe(env.alice.getPrincipal().toText());
    expect(variantKey(proposal.status)).toBe("open");
    expect(proposal.yesVotes).toBe(0n);

    unwrapOk(await vote(env, env.alice, created.id, { yes: null }));
    expect(await env.dao.actor.vote_info(created.id, env.alice.getPrincipal())).toEqual({
      hasVoted: true,
      choice: [{ yes: null }],
      voteWeight: 19n,
      lockedStake: 19n,
    });
    proposal = (await env.dao.actor.proposal(created.id))[0];
    expect(proposal.yesVotes).toBe(19n);

    await setTimeNanos(env, created.deadline);
    unwrapOk(await env.dao.actor.close(created.id));
    expect(variantKey((await env.dao.actor.proposal(created.id))[0].status)).toBe("passed");
    unwrapOk(await env.dao.actor.execute(created.id));
    expect(variantKey((await env.dao.actor.proposal(created.id))[0].status)).toBe("executed");
  });

  test("totals conserve across deposit, stake, proposal bond, vote, and execute", async () => {
    const amount = 100n;
    await depositStakeAndMature(env, env.alice, amount);
    expect(await env.dao.actor.dao_totals()).toEqual({
      totalSupply: amount,
      totalLiquid: 0n,
      totalActiveStake: amount,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 0n,
    });

    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 2n }));
    expect(await env.dao.actor.dao_totals()).toEqual({
      totalSupply: amount,
      totalLiquid: 0n,
      totalActiveStake: amount - 1n,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 1n,
    });

    unwrapOk(await vote(env, env.alice, created.id, { yes: null }));
    await setTimeNanos(env, created.deadline);
    unwrapOk(await env.dao.actor.close(created.id));
    unwrapOk(await env.dao.actor.execute(created.id));
    expect(await env.dao.actor.dao_totals()).toEqual({
      totalSupply: amount,
      totalLiquid: 0n,
      totalActiveStake: amount,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 0n,
    });
  });

  test("proposal window advances monotonically and never exceeds max proposal count", async () => {
    await depositStakeAndMature(env, env.alice, 5n);
    expect(await env.dao.actor.proposal_window()).toEqual({
      nextProposalId: 0n,
      maxProposals: 32n,
    });
    unwrapOk(await createProposal(env, env.alice, { setQuorum: 1n }));
    unwrapOk(await createProposal(env, env.alice, { setQuorum: 1n }));
    expect(await env.dao.actor.proposal_window()).toEqual({
      nextProposalId: 2n,
      maxProposals: 32n,
    });
    expect(await env.dao.actor.next_proposal_id()).toBe(2n);
  });
});
