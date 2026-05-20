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
  expectErrKey,
  requestUnstake,
  setTimeNanos,
  setupDaoE2E,
  vote,
  withdraw,
} from "./daoTestEnv.ts";

describe("dao mixed adversarial flows", () => {
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

  test("mixed multi-user proposal activity preserves caller isolation and vote locks", async () => {
    await depositStakeAndMature(env, env.alice, 20n);
    await depositStakeAndMature(env, env.bob, 10n);

    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    unwrapOk(await vote(env, env.alice, created.id, { yes: null }));
    unwrapOk(await vote(env, env.bob, created.id, { no: null }));

    expectErrKey(await requestUnstake(env, env.bob, 1n), "stakeLockedForVote");
    expectErrKey(await withdraw(env, env.alice, 1n), "insufficientLocalBalance");
    expectErrKey(await withdraw(env, env.bob, 1n), "insufficientLocalBalance");

    await setTimeNanos(env, created.deadline);
    const closed = unwrapOk<any>(await env.dao.actor.close(created.id));
    expect(variantKey(closed.status)).toBe("passed");
    expect(closed.yesVotes).toBe(19n);
    expect(closed.noVotes).toBe(10n);

    expect(unwrapOk<any>(await requestUnstake(env, env.bob, 1n)).pendingUnstake).toBe(1n);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).proposalBond).toBe(1n);
    expect((await env.dao.actor.stake_info(env.bob.getPrincipal())).pendingUnstake).toBe(1n);
  });
});
