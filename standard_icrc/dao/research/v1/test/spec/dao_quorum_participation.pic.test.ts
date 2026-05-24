import { afterAll, afterEach, describe, expect, test } from "bun:test";
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

describe("dao quorum and participation rules", () => {
  let env: DaoE2E | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("below-quorum proposals fail even when yes votes exceed no votes", async () => {
    env = await setupDaoE2E({ initialQuorumVotes: 5n });
    await depositStakeAndMature(env, env.alice, 100n);
    await depositStakeAndMature(env, env.bob, 4n);

    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    unwrapOk(await vote(env, env.bob, created.id, { yes: null }));
    await setTimeNanos(env, created.deadline);
    const closed = unwrapOk<any>(await env.dao.actor.close(created.id));
    expect(variantKey(closed.status)).toBe("failed");
    expect(closed.yesVotes).toBe(4n);
    expect(closed.quorumVotes).toBe(5n);
  });

  test("exactly three percent participation fails because the rule is strict", async () => {
    env = await setupDaoE2E();
    await depositStakeAndMature(env, env.alice, 98n);
    await depositStakeAndMature(env, env.bob, 3n);

    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 1n }));
    expect(created.snapshotActiveStake).toBe(100n);
    unwrapOk(await vote(env, env.bob, created.id, { yes: null }));
    await setTimeNanos(env, created.deadline);
    const closed = unwrapOk<any>(await env.dao.actor.close(created.id));
    expect(variantKey(closed.status)).toBe("failed");
    expect(closed.yesVotes).toBe(3n);
  });

  test("more than three percent participation passes when quorum is met", async () => {
    env = await setupDaoE2E();
    await depositStakeAndMature(env, env.alice, 97n);
    await depositStakeAndMature(env, env.bob, 4n);

    const created = unwrapOk<any>(await createProposal(env, env.alice, { setQuorum: 2n }));
    expect(created.snapshotActiveStake).toBe(100n);
    unwrapOk(await vote(env, env.bob, created.id, { yes: null }));
    await setTimeNanos(env, created.deadline);
    const closed = unwrapOk<any>(await env.dao.actor.close(created.id));
    expect(variantKey(closed.status)).toBe("passed");
    expect(closed.yesVotes).toBe(4n);
  });
});
