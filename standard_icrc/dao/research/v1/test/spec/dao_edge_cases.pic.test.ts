import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import {
  balanceOf,
  transfer,
} from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
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

describe("dao edge cases and bug probes", () => {
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

  test("stale execution returns the bond once and cannot be replayed", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    await depositStakeAndMature(env, env.bob, 20n);

    const oldProposal = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 3n }));
    unwrapOk(await vote(env, env.alice, oldProposal.id, { yes: null }));
    await setTimeNanos(env, oldProposal.deadline);
    expect(variantKey(unwrapOk<any>(await env.dao.actor.close(oldProposal.id)).status)).toBe(
      "passed",
    );

    const newerProposal = unwrapOk<any>(
      await createProposal(env, env.bob, { setProposalThreshold: 2n }),
    );
    unwrapOk(await vote(env, env.bob, newerProposal.id, { yes: null }));
    await setTimeNanos(env, newerProposal.deadline);
    expect(variantKey(unwrapOk<any>(await env.dao.actor.close(newerProposal.id)).status)).toBe(
      "passed",
    );
    expect(unwrapOk<any>(await env.dao.actor.execute(newerProposal.id)).applied).toBe(true);

    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(1n);
    const stale = unwrapOk<any>(await env.dao.actor.execute(oldProposal.id));
    expect(stale.applied).toBe(false);
    expect(stale.configVersion).toBe(1n);
    expect(variantKey((await env.dao.actor.proposal(oldProposal.id))[0].status)).toBe("stale");
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(0n);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).activeStake).toBe(20n);

    expectErrKey(await env.dao.actor.execute(oldProposal.id), "proposalNotPassed");
    expectErrKey(await env.dao.actor.close(oldProposal.id), "proposalNotOpen");
    expect(await env.dao.actor.config_version()).toBe(1n);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).activeStake).toBe(20n);
  });

  test("new proposals after stale settlement capture the latest config version", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    await depositStakeAndMature(env, env.bob, 20n);

    const oldProposal = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 3n }));
    unwrapOk(await vote(env, env.alice, oldProposal.id, { yes: null }));
    await setTimeNanos(env, oldProposal.deadline);
    unwrapOk(await env.dao.actor.close(oldProposal.id));

    const newerProposal = unwrapOk<any>(
      await createProposal(env, env.bob, { setProposalThreshold: 2n }),
    );
    unwrapOk(await vote(env, env.bob, newerProposal.id, { yes: null }));
    await setTimeNanos(env, newerProposal.deadline);
    unwrapOk(await env.dao.actor.close(newerProposal.id));
    unwrapOk(await env.dao.actor.execute(newerProposal.id));
    unwrapOk(await env.dao.actor.execute(oldProposal.id));

    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    expect(created.configVersion).toBe(1n);
    expect(created.snapshotActiveStake).toBe(38n);
    expect((await env.dao.actor.proposal(created.id))[0].configVersion).toBe(1n);
    expect(await env.dao.actor.config_version()).toBe(1n);
  });

  test("updated proposal threshold controls future bonds and cannot be bypassed", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    await depositStakeAndMature(env, env.bob, 4n);

    const thresholdProposal = unwrapOk<any>(
      await createProposal(env, env.alice, { setProposalThreshold: 5n }),
    );
    unwrapOk(await vote(env, env.alice, thresholdProposal.id, { yes: null }));
    await setTimeNanos(env, thresholdProposal.deadline);
    unwrapOk(await env.dao.actor.close(thresholdProposal.id));
    const executed = unwrapOk<any>(await env.dao.actor.execute(thresholdProposal.id));
    expect(executed.applied).toBe(true);
    expect(executed.config).toEqual({
      quorumVotes: 1n,
      proposalThreshold: 5n,
    });

    expectErrKey(await createProposal(env, env.bob, { setQuorum: 1n }), "proposalThresholdNotMet");

    unwrapOk(await approveAndDeposit(env, env.bob, 1n));
    const staked = unwrapOk<any>(await stake(env, env.bob, 1n));
    await setTimeNanos(env, staked.votingPowerUnlockAt);
    const created = unwrapOk<any>(await createProposal(env, env.bob, { setQuorum: 1n }));
    expect(created.configVersion).toBe(1n);
    expect((await env.dao.actor.stake_info(env.bob.getPrincipal())).activeStake).toBe(0n);
    expect((await env.dao.actor.stake_info(env.bob.getPrincipal())).proposalBond).toBe(5n);
  });

  test("failed bond burn lowers the config-action supply boundary", async () => {
    await depositStakeAndMature(env, env.alice, 10n);

    const failed = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    await setTimeNanos(env, failed.deadline);
    expect(variantKey(unwrapOk<any>(await env.dao.actor.close(failed.id)).status)).toBe("failed");
    expect((await env.dao.actor.dao_totals()).totalSupply).toBe(9n);

    expectErrKey(await createProposal(env, env.alice, { setQuorum: 10n }), "invalidConfigAction");
    expect((await env.dao.actor.proposal_window()).nextProposalId).toBe(1n);

    const accepted = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 9n }));
    expect(accepted.id).toBe(1n);
    expect(accepted.snapshotActiveStake).toBe(8n);
  });

  test("direct external token surplus does not satisfy DAO local supply checks", async () => {
    const directAmount = 1_000_000n;
    await transfer(env.ledger, env.bob, env.dao.canisterId, directAmount);
    await depositStakeAndMature(env, env.alice, 10n);

    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(directAmount + 10n);
    expect((await env.dao.actor.dao_totals()).totalSupply).toBe(10n);
    expectErrKey(await createProposal(env, env.alice, { setQuorum: 11n }), "invalidConfigAction");
    expect((await env.dao.actor.proposal_window()).nextProposalId).toBe(0n);
  });

  test("extra stake after voting can fund new bonds only after rematurity and within lock bounds", async () => {
    await depositStakeAndMature(env, env.alice, 10n);
    const first = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    unwrapOk(await vote(env, env.alice, first.id, { yes: null }));
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).activeVoteLock).toBe(9n);

    unwrapOk(await approveAndDeposit(env, env.alice, 3n));
    const extraStake = unwrapOk<any>(await stake(env, env.alice, 3n));
    expectErrKey(await createProposal(env, env.alice, { setQuorum: 1n }), "stakeLockActive");

    await setTimeNanos(env, extraStake.votingPowerUnlockAt);
    const second = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    expect(second.id).toBe(1n);
    const afterSecond = await env.dao.actor.stake_info(env.alice.getPrincipal());
    expect(afterSecond.activeStake).toBe(11n);
    expect(afterSecond.activeVoteLock).toBe(9n);
    expect(afterSecond.proposalBond).toBe(2n);

    expectErrKey(await requestUnstake(env, env.alice, 3n), "stakeLockedForVote");
    const unstaked = unwrapOk<any>(await requestUnstake(env, env.alice, 2n));
    expect(unstaked.activeStake).toBe(9n);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).activeVoteLock).toBe(9n);
  });
});
