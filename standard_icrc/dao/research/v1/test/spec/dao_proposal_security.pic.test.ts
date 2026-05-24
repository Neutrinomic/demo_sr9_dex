import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import { balanceOf } from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  createProposal,
  depositStakeAndMature,
  type DaoE2E,
  expectErrKey,
  setTimeNanos,
  setupDaoE2E,
  vote,
} from "./daoTestEnv.ts";

describe("dao proposal security", () => {
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

  test("double voting is rejected and vote totals stay unchanged", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    await depositStakeAndMature(env, env.bob, 10n);
    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));

    unwrapOk(await vote(env, env.bob, created.id, { yes: null }));
    expectErrKey(await vote(env, env.bob, created.id, { no: null }), "alreadyVoted");

    const proposal = (await env.dao.actor.proposal(created.id))[0];
    expect(proposal.yesVotes).toBe(10n);
    expect(proposal.noVotes).toBe(0n);
    expect(await env.dao.actor.vote_info(created.id, env.bob.getPrincipal())).toEqual({
      hasVoted: true,
      choice: [{ yes: null }],
      voteWeight: 10n,
      lockedStake: 10n,
    });
  });

  test("deadline and close ordering reject early close, late vote, and double close", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));

    expectErrKey(await env.dao.actor.close(created.id), "votingPeriodActive");
    await setTimeNanos(env, created.deadline);
    expectErrKey(await vote(env, env.alice, created.id, { yes: null }), "votingPeriodEnded");

    const closed = unwrapOk<any>(await env.dao.actor.close(created.id));
    expect(variantKey(closed.status)).toBe("failed");
    expectErrKey(await env.dao.actor.close(created.id), "proposalNotOpen");
  });

  test("execute ordering only applies passed proposals once", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    const failed = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));

    expectErrKey(await env.dao.actor.execute(failed.id), "proposalNotPassed");
    await setTimeNanos(env, failed.deadline);
    unwrapOk(await env.dao.actor.close(failed.id));
    expectErrKey(await env.dao.actor.execute(failed.id), "proposalNotPassed");

    const passed = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 2n }));
    unwrapOk(await vote(env, env.alice, passed.id, { yes: null }));
    await setTimeNanos(env, passed.deadline);
    expect(variantKey(unwrapOk<any>(await env.dao.actor.close(passed.id)).status)).toBe("passed");
    const executed = unwrapOk<any>(await env.dao.actor.execute(passed.id));
    expect(executed.applied).toBe(true);
    expect(executed.configVersion).toBe(1n);
    expect(executed.config.quorumVotes).toBe(2n);
    expectErrKey(await env.dao.actor.execute(passed.id), "alreadyExecuted");
    expectErrKey(await env.dao.actor.close(passed.id), "proposalNotOpen");
  });

  test("failed proposals burn local bond accounting without moving external ledger tokens", async () => {
    const amount = 100n;
    await depositStakeAndMature(env, env.alice, amount);
    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    expect((await env.dao.actor.dao_totals()).totalProposalBonds).toBe(1n);
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(amount);

    await setTimeNanos(env, created.deadline);
    const closed = unwrapOk<any>(await env.dao.actor.close(created.id));
    expect(variantKey(closed.status)).toBe("failed");
    expect(await env.dao.actor.dao_totals()).toEqual({
      totalSupply: amount - 1n,
      totalLiquid: 0n,
      totalActiveStake: amount - 1n,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 0n,
    });
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(amount);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(0n);
  });

  test("passed proposal bond is returned only when executed", async () => {
    const amount = 100n;
    await depositStakeAndMature(env, env.alice, amount);
    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 2n }));
    unwrapOk(await vote(env, env.alice, created.id, { yes: null }));
    await setTimeNanos(env, created.deadline);

    expect(variantKey(unwrapOk<any>(await env.dao.actor.close(created.id)).status)).toBe("passed");
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(1n);
    expect((await env.dao.actor.dao_totals()).totalProposalBonds).toBe(1n);
    expect(await env.dao.actor.proposal_config()).toEqual({
      quorumVotes: 1n,
      proposalThreshold: 1n,
    });

    unwrapOk(await env.dao.actor.execute(created.id));
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(0n);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).activeStake).toBe(amount);
    expect(await env.dao.actor.proposal_config()).toEqual({
      quorumVotes: 2n,
      proposalThreshold: 1n,
    });
  });

  test("invalid config actions reject and boundary values at total supply are accepted", async () => {
    await depositStakeAndMature(env, env.alice, 10n);

    expectErrKey(await createProposal(env, env.alice, { setQuorum: 0n }), "invalidConfigAction");
    expectErrKey(
      await createProposal(env, env.alice, { setProposalThreshold: 0n }),
      "invalidConfigAction",
    );
    expectErrKey(await createProposal(env, env.alice, { setQuorum: 11n }), "invalidConfigAction");
    expectErrKey(
      await createProposal(env, env.alice, {
        setConfig: { quorumVotes: 1n, proposalThreshold: 11n },
      }),
      "invalidConfigAction",
    );
    expect((await env.dao.actor.proposal_window()).nextProposalId).toBe(0n);

    const ok = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 10n }));
    expect(ok.id).toBe(0n);
  });
});
