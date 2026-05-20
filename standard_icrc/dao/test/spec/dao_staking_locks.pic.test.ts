import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import {
  approveAndDeposit,
  createProposal,
  depositStakeAndMature,
  type DaoE2E,
  expectErrKey,
  requestUnstake,
  setTimeNanos,
  setupDaoE2E,
  stake,
  vote,
} from "./daoTestEnv.ts";

describe("dao staking and vote locks", () => {
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

  test("stake maturity gates voting power and proposal creation", async () => {
    unwrapOk(await approveAndDeposit(env, env.alice, 10n));
    const staked = unwrapOk<any>(await stake(env, env.alice, 10n));

    expect(await env.dao.actor.voting_power(env.alice.getPrincipal())).toBe(0n);
    expectErrKey(await createProposal(env, env.alice, { setQuorum: 1n }), "stakeLockActive");

    await setTimeNanos(env, staked.votingPowerUnlockAt);
    expect(await env.dao.actor.voting_power(env.alice.getPrincipal())).toBe(10n);
    expect(unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n })).id).toBe(0n);
  });

  test("immature voters are rejected without changing proposal vote totals", async () => {
    await depositStakeAndMature(env, env.bob, 20n);
    unwrapOk(await approveAndDeposit(env, env.alice, 10n));
    unwrapOk(await stake(env, env.alice, 10n));

    unwrapOk(await createProposal(env, env.bob, { setQuorum: 1n }));
    expectErrKey(await vote(env, env.alice, 0n, { yes: null }), "stakeLockActive");
    const proposal = (await env.dao.actor.proposal(0n))[0];
    expect(proposal.yesVotes).toBe(0n);
    expect(proposal.noVotes).toBe(0n);
  });

  test("adding stake resets voting maturity for all active stake", async () => {
    await depositStakeAndMature(env, env.alice, 10n);
    expect(await env.dao.actor.voting_power(env.alice.getPrincipal())).toBe(10n);

    unwrapOk(await approveAndDeposit(env, env.alice, 1n));
    unwrapOk(await stake(env, env.alice, 1n));
    expect(await env.dao.actor.voting_power(env.alice.getPrincipal())).toBe(0n);
    expectErrKey(await createProposal(env, env.alice, { setQuorum: 1n }), "stakeLockActive");

    const unlockAt = (await env.dao.actor.stake_info(env.alice.getPrincipal())).votingPowerUnlockAt[0];
    await setTimeNanos(env, unlockAt);
    expect(await env.dao.actor.voting_power(env.alice.getPrincipal())).toBe(11n);
  });

  test("unstake cooldown has one pending request and must mature before claim", async () => {
    await depositStakeAndMature(env, env.alice, 10n);

    const requested = unwrapOk<any>(await requestUnstake(env, env.alice, 4n));
    expect(requested.activeStake).toBe(6n);
    expect(requested.pendingUnstake).toBe(4n);
    expectErrKey(await env.dao.actor.claim_unstaked(), "cooldownActive");
    expectErrKey(await requestUnstake(env, env.alice, 1n), "unstakeAlreadyPending");

    await setTimeNanos(env, requested.unlockAt);
    const claimed = unwrapOk<any>(await env.dao.actor.claim_unstaked());
    expect(claimed.amount).toBe(4n);
    expect(claimed.liquidBalance).toBe(4n);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).pendingUnstake).toBe(0n);
  });

  test("open vote locks block unstaking until the voted proposal closes", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    await depositStakeAndMature(env, env.bob, 10n);
    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));

    unwrapOk(await vote(env, env.bob, created.id, { yes: null }));
    expect(await env.dao.actor.vote_info(created.id, env.bob.getPrincipal())).toEqual({
      hasVoted: true,
      choice: [{ yes: null }],
      voteWeight: 10n,
      lockedStake: 10n,
    });
    expect((await env.dao.actor.stake_info(env.bob.getPrincipal())).activeVoteLock).toBe(10n);
    expectErrKey(await requestUnstake(env, env.bob, 1n), "stakeLockedForVote");

    await setTimeNanos(env, created.deadline);
    unwrapOk(await env.dao.actor.close(created.id));
    expect(unwrapOk<any>(await requestUnstake(env, env.bob, 1n)).pendingUnstake).toBe(1n);
  });

  test("multiple open proposals keep the maximum open vote lock", async () => {
    await depositStakeAndMature(env, env.alice, 30n);
    await depositStakeAndMature(env, env.bob, 10n);
    const first = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    unwrapOk(await vote(env, env.bob, first.id, { yes: null }));

    await env.runtime.advanceSeconds(86_400n, { ticks: 2 });
    const second = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    unwrapOk(await vote(env, env.bob, second.id, { yes: null }));

    await setTimeNanos(env, first.deadline);
    unwrapOk(await env.dao.actor.close(first.id));
    expect((await env.dao.actor.stake_info(env.bob.getPrincipal())).activeVoteLock).toBe(10n);

    await setTimeNanos(env, second.deadline);
    unwrapOk(await env.dao.actor.close(second.id));
    expect((await env.dao.actor.stake_info(env.bob.getPrincipal())).activeVoteLock).toBe(0n);
  });

  test("proposal bonds cannot reuse stake that is already backing an open vote", async () => {
    await depositStakeAndMature(env, env.alice, 10n);
    const first = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    unwrapOk(await vote(env, env.alice, first.id, { yes: null }));
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).activeVoteLock).toBe(9n);

    expectErrKey(await createProposal(env, env.alice, { setQuorum: 1n }), "stakeLockedForVote");
    const info = await env.dao.actor.stake_info(env.alice.getPrincipal());
    expect(info.activeStake).toBe(9n);
    expect(info.activeVoteLock).toBe(9n);
    expect(info.proposalBond).toBe(1n);
    expectErrKey(await requestUnstake(env, env.alice, 1n), "stakeLockedForVote");
    expect(variantKey((await env.dao.actor.proposal(first.id))[0].status)).toBe("open");
  });
});
