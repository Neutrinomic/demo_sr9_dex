import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import {
  createDaoScenario,
  type DaoScenario,
} from "./support/daoScenario.ts";

describe("dao scenario model", () => {
  let s: DaoScenario;

  beforeEach(async () => {
    s = await createDaoScenario({
      name: "scenario-model",
      userCount: 3,
    });
  });

  afterEach(async () => {
    await s.tearDown();
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("tracks a full deposit, stake, proposal, execute, unstake, claim, and withdraw cycle", async () => {
    unwrapOk(await s.approveAndDeposit(0, 200_000n));
    const staked = unwrapOk<any>(await s.stake(0, 200_000n));
    await s.matureAt(staked.votingPowerUnlockAt);

    const created = unwrapOk<any>(await s.createProposal(0, { setQuorum: 2n }));
    unwrapOk(await s.vote(0, created.id, { yes: null }));
    await s.matureAt(created.deadline);
    expect(variantKey(unwrapOk<any>(await s.close(created.id)).status)).toBe("passed");
    const executed = unwrapOk<any>(await s.execute(created.id));
    expect(executed.applied).toBe(true);
    expect(executed.configVersion).toBe(1n);
    expect(executed.config).toEqual({
      quorumVotes: 2n,
      proposalThreshold: 1n,
    });

    const unstaked = unwrapOk<any>(await s.requestUnstake(0, 200_000n));
    await s.matureAt(unstaked.unlockAt);
    unwrapOk(await s.claimUnstaked(0));
    unwrapOk(await s.withdraw(0, 190_000n));

    expect(s.model.totalSupply()).toBe(0n);
    expect(s.model.daoLedgerBalance).toBe(0n);
    await s.assertAll();
  });

  test("keeps direct transfers and burned failed bonds in external surplus, not local credit", async () => {
    await s.directTransfer(0, 50_000n);
    expect(s.model.totalSupply()).toBe(0n);
    expect(s.model.daoLedgerBalance).toBe(50_000n);

    const staked = unwrapOk<any>(await s.approveAndDeposit(1, 100n).then(() => s.stake(1, 100n)));
    await s.matureAt(staked.votingPowerUnlockAt);
    const created = unwrapOk<any>(await s.createProposal(1, { setQuorum: 1n }));
    await s.matureAt(created.deadline);
    expect(variantKey(unwrapOk<any>(await s.close(created.id)).status)).toBe("failed");

    expect(s.model.totalSupply()).toBe(99n);
    expect(s.model.daoLedgerBalance).toBe(50_100n);
    await s.assertAll();
  });

  test("tracks multi-user vote locks across overlapping proposals", async () => {
    const alice = unwrapOk<any>(await s.approveAndDeposit(0, 30n).then(() => s.stake(0, 30n)));
    const bob = unwrapOk<any>(await s.approveAndDeposit(1, 10n).then(() => s.stake(1, 10n)));
    await s.matureAt(alice.votingPowerUnlockAt > bob.votingPowerUnlockAt ? alice.votingPowerUnlockAt : bob.votingPowerUnlockAt);

    const first = unwrapOk<any>(await s.createProposal(0, { setQuorum: 1n }));
    unwrapOk(await s.vote(1, first.id, { yes: null }));
    await s.runtime.advanceSeconds(86_400n, { ticks: 2 });
    const second = unwrapOk<any>(await s.createProposal(0, { setQuorum: 1n }));
    unwrapOk(await s.vote(1, second.id, { yes: null }));

    await s.matureAt(first.deadline);
    unwrapOk(await s.close(first.id));
    expect((await s.dao.actor.stake_info(s.users[1].getPrincipal())).activeVoteLock).toBe(10n);

    await s.matureAt(second.deadline);
    unwrapOk(await s.close(second.id));
    expect((await s.dao.actor.stake_info(s.users[1].getPrincipal())).activeVoteLock).toBe(0n);
    await s.assertAll();
  });
});
