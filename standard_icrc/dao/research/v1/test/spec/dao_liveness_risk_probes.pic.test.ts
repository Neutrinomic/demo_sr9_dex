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
  setTimeNanos,
  setupDaoE2E,
  vote,
  withdraw,
} from "./daoTestEnv.ts";

describe("dao liveness risk probes", () => {
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

  test("passed config proposals execute against their captured config version even if supply drops", async () => {
    const amount = 1_000_000n;
    await depositStakeAndMature(env, env.alice, amount);
    unwrapOk(await approveAndDeposit(env, env.bob, amount));

    const created = unwrapOk<any>(await createProposal(env, env.alice, {
      setQuorum: amount * 2n,
    }));
    unwrapOk(await vote(env, env.alice, created.id, { yes: null }));
    await setTimeNanos(env, created.deadline);
    expect(variantKey(unwrapOk<any>(await env.dao.actor.close(created.id)).status)).toBe("passed");

    unwrapOk(await withdraw(env, env.bob, 10_000n));
    const executed = unwrapOk<any>(await env.dao.actor.execute(created.id));

    const proposal = (await env.dao.actor.proposal(created.id))[0];
    expect(executed.applied).toBe(true);
    expect(executed.configVersion).toBe(1n);
    expect(executed.config.quorumVotes).toBe(amount * 2n);
    expect(variantKey(proposal.status)).toBe("executed");
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(0n);
  });

  test("stale passed proposals settle without overwriting newer executed config", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    await depositStakeAndMature(env, env.bob, 20n);

    const oldProposal = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 3n }));
    unwrapOk(await vote(env, env.alice, oldProposal.id, { yes: null }));
    await setTimeNanos(env, oldProposal.deadline);
    expect(variantKey(unwrapOk<any>(await env.dao.actor.close(oldProposal.id)).status)).toBe("passed");

    const newProposal = unwrapOk<any>(
      await createProposal(env, env.bob, { setProposalThreshold: 2n }),
    );
    unwrapOk(await vote(env, env.bob, newProposal.id, { yes: null }));
    await setTimeNanos(env, newProposal.deadline);
    expect(variantKey(unwrapOk<any>(await env.dao.actor.close(newProposal.id)).status)).toBe("passed");

    const newer = unwrapOk<any>(await env.dao.actor.execute(newProposal.id));
    expect(newer.applied).toBe(true);
    expect(newer.configVersion).toBe(1n);
    expect(await env.dao.actor.proposal_config()).toEqual({
      quorumVotes: 1n,
      proposalThreshold: 2n,
    });

    const stale = unwrapOk<any>(await env.dao.actor.execute(oldProposal.id));
    expect(stale.applied).toBe(false);
    expect(stale.configVersion).toBe(1n);
    expect(stale.config).toEqual({
      quorumVotes: 1n,
      proposalThreshold: 2n,
    });
    expect(variantKey((await env.dao.actor.proposal(oldProposal.id))[0].status)).toBe("stale");
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(0n);
    expect(await env.dao.actor.proposal_config()).toEqual({
      quorumVotes: 1n,
      proposalThreshold: 2n,
    });
  });

  test("proposal capacity is lifetime bounded and closing does not free a slot", async () => {
    await depositStakeAndMature(env, env.alice, 40n);

    for (let i = 0n; i < 32n; i += 1n) {
      const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
      expect(created.id).toBe(i);
    }
    expect(await env.dao.actor.proposal_window()).toEqual({
      nextProposalId: 32n,
      maxProposals: 32n,
    });
    expectErrKey(await createProposal(env, env.alice, { setQuorum: 1n }), "proposalCapacityReached");

    const first = (await env.dao.actor.proposal(0n))[0];
    await setTimeNanos(env, first.deadline);
    unwrapOk(await env.dao.actor.close(0n));
    expectErrKey(await createProposal(env, env.alice, { setQuorum: 1n }), "proposalCapacityReached");
  });
});
