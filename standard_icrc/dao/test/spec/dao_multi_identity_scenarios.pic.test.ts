import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import { expectErrKey } from "./daoTestEnv.ts";
import {
  createDaoScenario,
  type DaoScenario,
} from "./support/daoScenario.ts";

describe("dao multi-identity scenarios", () => {
  let s: DaoScenario;

  beforeEach(async () => {
    s = await createDaoScenario({
      name: "multi-identity",
      userCount: 6,
    });
  });

  afterEach(async () => {
    await s.tearDown();
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("overlapping proposals keep vote locks isolated by voter", async () => {
    await stakeUsersAndMature(s, [40n, 13n, 17n, 21n, 25n, 5n]);

    const first = unwrapOk<any>(await s.createProposal(0, { setQuorum: 2n }));
    unwrapOk(await s.vote(1, first.id, { yes: null }));
    unwrapOk(await s.vote(2, first.id, { no: null }));

    const second = unwrapOk<any>(await s.createProposal(3, { setProposalThreshold: 2n }));
    unwrapOk(await s.vote(1, second.id, { yes: null }));
    unwrapOk(await s.vote(4, second.id, { yes: null }));

    expect((await s.dao.actor.stake_info(s.users[1].getPrincipal())).activeVoteLock).toBe(13n);
    expect((await s.dao.actor.stake_info(s.users[2].getPrincipal())).activeVoteLock).toBe(17n);
    expect((await s.dao.actor.stake_info(s.users[4].getPrincipal())).activeVoteLock).toBe(25n);
    expectErrKey(await s.requestUnstake(1, 1n), "stakeLockedForVote");
    expect(unwrapOk<any>(await s.requestUnstake(5, 1n)).pendingUnstake).toBe(1n);

    await s.matureAt(first.deadline);
    expect(variantKey(unwrapOk<any>(await s.close(first.id)).status)).toBe("failed");
    expect((await s.dao.actor.stake_info(s.users[1].getPrincipal())).activeVoteLock).toBe(13n);
    expect((await s.dao.actor.stake_info(s.users[2].getPrincipal())).activeVoteLock).toBe(0n);
    expect(unwrapOk<any>(await s.requestUnstake(2, 1n)).pendingUnstake).toBe(1n);
    expectErrKey(await s.requestUnstake(1, 1n), "stakeLockedForVote");

    await s.matureAt(second.deadline);
    expect(variantKey(unwrapOk<any>(await s.close(second.id)).status)).toBe("passed");
    expect(unwrapOk<any>(await s.execute(second.id)).applied).toBe(true);
    expect(unwrapOk<any>(await s.requestUnstake(1, 1n)).pendingUnstake).toBe(1n);
    await s.assertAll();
  });

  test("proposal bonds stay accounted per proposer through failed, applied, and stale paths", async () => {
    await stakeUsersAndMature(s, [20n, 20n, 20n, 20n]);

    const failed = unwrapOk<any>(await s.createProposal(0, { setQuorum: 1n }));
    await s.matureAt(failed.deadline);
    expect(variantKey(unwrapOk<any>(await s.close(failed.id)).status)).toBe("failed");
    expect((await s.dao.actor.dao_totals()).totalSupply).toBe(79n);
    expect((await s.dao.actor.stake_info(s.users[0].getPrincipal())).activeStake).toBe(19n);

    const applied = unwrapOk<any>(await s.createProposal(1, { setQuorum: 2n }));
    unwrapOk(await s.vote(1, applied.id, { yes: null }));
    await s.matureAt(applied.deadline);
    expect(variantKey(unwrapOk<any>(await s.close(applied.id)).status)).toBe("passed");
    expect(unwrapOk<any>(await s.execute(applied.id)).configVersion).toBe(1n);

    const oldPassed = unwrapOk<any>(await s.createProposal(2, { setQuorum: 5n }));
    unwrapOk(await s.vote(2, oldPassed.id, { yes: null }));
    const newerPassed = unwrapOk<any>(await s.createProposal(3, { setProposalThreshold: 2n }));
    unwrapOk(await s.vote(3, newerPassed.id, { yes: null }));
    await s.matureAt(max(oldPassed.deadline, newerPassed.deadline));
    expect(variantKey(unwrapOk<any>(await s.close(oldPassed.id)).status)).toBe("passed");
    expect(variantKey(unwrapOk<any>(await s.close(newerPassed.id)).status)).toBe("passed");

    const newer = unwrapOk<any>(await s.execute(newerPassed.id));
    expect(newer.applied).toBe(true);
    expect(newer.configVersion).toBe(2n);
    const stale = unwrapOk<any>(await s.execute(oldPassed.id));
    expect(stale.applied).toBe(false);
    expect(stale.configVersion).toBe(2n);

    expect(await s.dao.actor.proposal_config()).toEqual({
      quorumVotes: 2n,
      proposalThreshold: 2n,
    });
    expect(await s.dao.actor.dao_totals()).toEqual({
      totalSupply: 79n,
      totalLiquid: 0n,
      totalActiveStake: 79n,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 0n,
    });
    expect((await s.dao.actor.stake_info(s.users[0].getPrincipal())).activeStake).toBe(19n);
    expect((await s.dao.actor.stake_info(s.users[1].getPrincipal())).activeStake).toBe(20n);
    expect((await s.dao.actor.stake_info(s.users[2].getPrincipal())).activeStake).toBe(20n);
    expect((await s.dao.actor.stake_info(s.users[3].getPrincipal())).activeStake).toBe(20n);
    await s.assertAll();
  });

  test("liquid-only, immature, mature, and untouched identities cannot borrow voting power", async () => {
    const proposer = unwrapOk<any>(await s.approveAndDeposit(0, 30n).then(() => s.stake(0, 30n)));
    const yesVoter = unwrapOk<any>(await s.approveAndDeposit(3, 20n).then(() => s.stake(3, 20n)));
    const noVoter = unwrapOk<any>(await s.approveAndDeposit(4, 15n).then(() => s.stake(4, 15n)));
    await s.matureAt(max(proposer.votingPowerUnlockAt, yesVoter.votingPowerUnlockAt, noVoter.votingPowerUnlockAt));

    unwrapOk(await s.approveAndDeposit(1, 20n));
    unwrapOk(await s.approveAndDeposit(2, 20n));
    unwrapOk(await s.stake(2, 20n));

    const proposal = unwrapOk<any>(await s.createProposal(0, { setQuorum: 1n }));
    expectErrKey(await s.vote(1, proposal.id, { yes: null }), "noVotingPower");
    expectErrKey(await s.createProposal(1, { setQuorum: 1n }), "proposalThresholdNotMet");
    expectErrKey(await s.vote(2, proposal.id, { yes: null }), "stakeLockActive");
    expectErrKey(await s.createProposal(2, { setQuorum: 1n }), "stakeLockActive");
    expectErrKey(await s.vote(5, proposal.id, { yes: null }), "noVotingPower");
    expectErrKey(await s.withdraw(5, 1n), "insufficientLocalBalance");

    unwrapOk(await s.vote(3, proposal.id, { yes: null }));
    unwrapOk(await s.vote(4, proposal.id, { no: null }));
    const open = (await s.dao.actor.proposal(proposal.id))[0];
    expect(open.yesVotes).toBe(20n);
    expect(open.noVotes).toBe(15n);

    await s.matureAt(proposal.deadline);
    expect(variantKey(unwrapOk<any>(await s.close(proposal.id)).status)).toBe("passed");
    expect(unwrapOk<any>(await s.execute(proposal.id)).applied).toBe(true);
    await s.assertAll();
  });

  test("mixed liquid, staked, direct-transfer, and withdrawal flows stay isolated while voting is open", async () => {
    unwrapOk(await s.approveAndDeposit(0, 100_000n));
    const user0Stake = unwrapOk<any>(await s.stake(0, 60_000n));
    const user1Stake = unwrapOk<any>(await s.approveAndDeposit(1, 80_000n).then(() => s.stake(1, 80_000n)));
    unwrapOk(await s.approveAndDeposit(2, 70_000n));
    await s.directTransfer(3, 50_000n);
    const user4Stake = unwrapOk<any>(await s.approveAndDeposit(4, 30_000n).then(() => s.stake(4, 30_000n)));
    await s.matureAt(max(user0Stake.votingPowerUnlockAt, user1Stake.votingPowerUnlockAt, user4Stake.votingPowerUnlockAt));

    const proposal = unwrapOk<any>(await s.createProposal(1, { setQuorum: 2n }));
    unwrapOk(await s.vote(1, proposal.id, { yes: null }));
    unwrapOk(await s.vote(0, proposal.id, { yes: null }));
    unwrapOk(await s.vote(4, proposal.id, { no: null }));

    unwrapOk(await s.withdraw(2, 50_000n));
    unwrapOk(await s.withdraw(0, 20_000n));
    expectErrKey(await s.requestUnstake(0, 1n), "stakeLockedForVote");
    expect((await s.dao.actor.stake_info(s.users[2].getPrincipal())).liquid).toBe(10_000n);
    expect((await s.dao.actor.stake_info(s.users[0].getPrincipal())).liquid).toBe(10_000n);

    await s.matureAt(proposal.deadline);
    expect(variantKey(unwrapOk<any>(await s.close(proposal.id)).status)).toBe("passed");
    expect(unwrapOk<any>(await s.execute(proposal.id)).applied).toBe(true);
    expect(unwrapOk<any>(await s.requestUnstake(0, 1n)).pendingUnstake).toBe(1n);
    expect(s.model.daoLedgerBalance).toBe(240_000n);
    await s.assertAll();
  });
});

async function stakeUsersAndMature(scenario: DaoScenario, amounts: bigint[]): Promise<void> {
  let unlockAt = 0n;
  for (let i = 0; i < amounts.length; i += 1) {
    unwrapOk(await scenario.approveAndDeposit(i, amounts[i]));
    const staked = unwrapOk<any>(await scenario.stake(i, amounts[i]));
    unlockAt = max(unlockAt, staked.votingPowerUnlockAt);
  }
  await scenario.matureAt(unlockAt);
}

function max(first: bigint, ...rest: bigint[]): bigint {
  let current = first;
  for (const value of rest) {
    if (value > current) {
      current = value;
    }
  }
  return current;
}
