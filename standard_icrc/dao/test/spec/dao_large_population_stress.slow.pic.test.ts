import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  unwrapOk,
} from "../../../../shared/common/runtime.ts";
import {
  approve,
  balanceOf,
} from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  createDaoScenario,
  type DaoScenario,
} from "./support/daoScenario.ts";

const slowTest =
  process.env.E2E_INCLUDE_SLOW === "1" || process.env.E2E_INCLUDE_SLOW === "true"
    ? test
    : test.skip;

describe("dao large population stress", () => {
  let s: DaoScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  slowTest("populates many users with staking, proposal, unstake, claim, and withdrawal churn", async () => {
    const userCount = parseIntEnv("E2E_DAO_STRESS_USERS", 1000);
    const proposalCount = Math.min(parseIntEnv("E2E_DAO_STRESS_PROPOSALS", 32), 32);
    const actionCount = parseIntEnv("E2E_DAO_STRESS_ACTIONS", 3000);
    const votersPerProposal = Math.min(
      parseIntEnv("E2E_DAO_STRESS_VOTERS", 64),
      userCount,
    );
    const waveSize = Math.max(1, parseIntEnv("E2E_DAO_STRESS_WAVE_SIZE", 8));

    s = await createDaoScenario({
      name: "dao-large-population",
      userCount,
      initialExternalBalance: 5_000_000_000n,
    });
    const state = new StressState(userCount);
    const rng = new SeededRandom(0xda011e);

    let maxStakeUnlock = 0n;
    for (let user = 0; user < userCount; user += 1) {
      const depositAmount = 120_000n + BigInt(user % 11) * 1_000n;
      const stakeAmount = 70_000n + BigInt(user % 7) * 1_000n;
      await deposit(user, depositAmount);
      const staked = await stake(user, stakeAmount);
      maxStakeUnlock = max(maxStakeUnlock, staked.votingPowerUnlockAt);
    }
    await s.matureAt(maxStakeUnlock);

    for (let offset = 0; offset < proposalCount; offset += waveSize) {
      const wave: ProposalProbe[] = [];
      const limit = Math.min(proposalCount, offset + waveSize);
      let maxDeadline = 0n;

      for (let id = offset; id < limit; id += 1) {
        const proposer = id % userCount;
        const action = { setQuorum: BigInt(1 + Math.floor(id / waveSize)) };
        const created = await createProposal(proposer, action);
        const shouldFail = id % 4 === 0;
        wave.push({
          id: created.id,
          proposer,
          shouldFail,
        });
        maxDeadline = max(maxDeadline, created.deadline);
      }

      for (let id = offset; id < limit; id += 1) {
        const proposal = wave[id - offset];
        if (!proposal.shouldFail) {
          for (let v = 0; v < votersPerProposal; v += 1) {
            const voter = (id * 17 + v) % userCount;
            await vote(voter, proposal.id);
          }
        }
      }

      await s.matureAt(maxDeadline);
      for (const proposal of wave) {
        const closed = unwrapOk<any>(await s.dao.actor.close(proposal.id));
        if ("failed" in closed.status) {
          state.burnProposalBond(proposal.proposer, 1n);
        }
      }
      for (const proposal of wave) {
        if (proposal.shouldFail) {
          continue;
        }
        const receipt = unwrapOk<any>(await s.dao.actor.execute(proposal.id));
        state.returnProposalBond(proposal.proposer, 1n);
        if (receipt.applied) {
          state.configVersion = receipt.configVersion;
          state.quorumVotes = receipt.config.quorumVotes;
        }
      }
    }

    let maxPendingUnlock = 0n;
    for (let i = 0; i < actionCount; i += 1) {
      const user = rng.int(userCount);
      const amount = rng.amount(500n, 5_000n);
      switch (rng.int(6)) {
        case 0:
          await deposit(user, amount + 20_000n);
          break;
        case 1:
          if (state.liquid[user] >= amount) {
            await stake(user, amount);
          }
          break;
        case 2:
          if (state.pendingUnstake[user] === 0n && state.activeStake[user] >= amount) {
            const requested = await requestUnstake(user, amount);
            maxPendingUnlock = max(maxPendingUnlock, requested.unlockAt);
          }
          break;
        case 3: {
          const debit = amount + s.ledger.fee;
          if (state.liquid[user] >= debit) {
            await withdraw(user, amount);
          }
          break;
        }
        case 4:
          await s.dao.actor.proposal_window();
          await s.dao.actor.dao_totals();
          break;
        default:
          await s.dao.actor.stake_info(s.users[user].getPrincipal());
      }
    }

    if (maxPendingUnlock > 0n) {
      await s.matureAt(maxPendingUnlock);
      for (let user = 0; user < userCount; user += 1) {
        if (state.pendingUnstake[user] > 0n) {
          await claimUnstaked(user);
        }
      }
    }

    await assertTotals();
    await assertSampledUsers();
    expect(await balanceOf(s.ledger, s.dao.canisterId)).toBe(state.externalBalance);

    async function deposit(user: number, amount: bigint): Promise<void> {
      const identity = s!.users[user];
      await approve(s!.ledger, identity, s!.dao.canisterId, amount + s!.ledger.fee);
      s!.runtime.as(s!.dao.actor, identity);
      const receipt = unwrapOk<any>(await s!.dao.actor.spi_101_deposit({
        subject: identity.getPrincipal(),
        ledger: s!.ledger.canisterId,
        from: s!.runtime.account(identity),
        amount,
      }));
      expect(receipt.amount).toBe(amount);
      state.deposit(user, amount);
    }

    async function stake(user: number, amount: bigint): Promise<any> {
      s!.runtime.as(s!.dao.actor, s!.users[user]);
      const receipt = unwrapOk<any>(
        await s!.dao.actor.stake(s!.users[user].getPrincipal(), amount),
      );
      expect(receipt.amount).toBe(amount);
      state.stake(user, amount);
      return receipt;
    }

    async function requestUnstake(user: number, amount: bigint): Promise<any> {
      s!.runtime.as(s!.dao.actor, s!.users[user]);
      const receipt = unwrapOk<any>(
        await s!.dao.actor.request_unstake(s!.users[user].getPrincipal(), amount),
      );
      expect(receipt.amount).toBe(amount);
      state.requestUnstake(user, amount);
      return receipt;
    }

    async function claimUnstaked(user: number): Promise<void> {
      s!.runtime.as(s!.dao.actor, s!.users[user]);
      const receipt = unwrapOk<any>(
        await s!.dao.actor.claim_unstaked(s!.users[user].getPrincipal()),
      );
      expect(receipt.amount).toBe(state.pendingUnstake[user]);
      state.claimUnstaked(user);
    }

    async function withdraw(user: number, amount: bigint): Promise<void> {
      s!.runtime.as(s!.dao.actor, s!.users[user]);
      const receipt = unwrapOk<any>(await s!.dao.actor.spi_101_withdraw({
        subject: s!.users[user].getPrincipal(),
        ledger: s!.ledger.canisterId,
        to: s!.runtime.account(s!.users[user]),
        amount,
      }));
      expect(receipt.amount).toBe(amount);
      state.withdraw(user, receipt.debitAmount);
    }

    async function createProposal(
      user: number,
      action: { setQuorum: bigint },
    ): Promise<any> {
      s!.runtime.as(s!.dao.actor, s!.users[user]);
      const receipt = unwrapOk<any>(
        await s!.dao.actor.create_proposal(s!.users[user].getPrincipal(), action),
      );
      state.reserveProposalBond(user, 1n);
      return receipt;
    }

    async function vote(user: number, id: bigint): Promise<void> {
      s!.runtime.as(s!.dao.actor, s!.users[user]);
      unwrapOk(await s!.dao.actor.vote(s!.users[user].getPrincipal(), id, { yes: null }));
    }

    async function assertTotals(): Promise<void> {
      expect(await s!.dao.actor.dao_totals()).toEqual({
        totalSupply: state.totalSupply,
        totalLiquid: state.totalLiquid,
        totalActiveStake: state.totalActiveStake,
        totalPendingUnstake: state.totalPendingUnstake,
        totalPendingWithdraw: 0n,
        totalProposalBonds: state.totalProposalBonds,
      });
      expect(await s!.dao.actor.config_version()).toBe(state.configVersion);
      expect((await s!.dao.actor.proposal_config()).quorumVotes).toBe(state.quorumVotes);
      expect(await s!.dao.actor.proposal_window()).toEqual({
        nextProposalId: BigInt(proposalCount),
        maxProposals: 32n,
      });
    }

    async function assertSampledUsers(): Promise<void> {
      const seen = new Set<number>();
      const sampleCount = Math.min(userCount, 128);
      for (let i = 0; i < sampleCount; i += 1) {
        seen.add(i);
        seen.add((i * 7919) % userCount);
      }
      seen.add(userCount - 1);

      for (const user of seen) {
        const info = await s!.dao.actor.stake_info(s!.users[user].getPrincipal());
        expect(info.liquid).toBe(state.liquid[user]);
        expect(info.activeStake).toBe(state.activeStake[user]);
        expect(info.pendingUnstake).toBe(state.pendingUnstake[user]);
        expect(info.proposalBond).toBe(state.proposalBond[user]);
        expect(info.pendingWithdraw).toBe(0n);
      }
    }
  });
});

type ProposalProbe = {
  id: bigint;
  proposer: number;
  shouldFail: boolean;
};

class StressState {
  readonly liquid: bigint[];
  readonly activeStake: bigint[];
  readonly pendingUnstake: bigint[];
  readonly proposalBond: bigint[];
  totalSupply = 0n;
  totalLiquid = 0n;
  totalActiveStake = 0n;
  totalPendingUnstake = 0n;
  totalProposalBonds = 0n;
  externalBalance = 0n;
  configVersion = 0n;
  quorumVotes = 1n;

  constructor(userCount: number) {
    this.liquid = Array<bigint>(userCount).fill(0n);
    this.activeStake = Array<bigint>(userCount).fill(0n);
    this.pendingUnstake = Array<bigint>(userCount).fill(0n);
    this.proposalBond = Array<bigint>(userCount).fill(0n);
  }

  deposit(user: number, amount: bigint): void {
    this.liquid[user] += amount;
    this.totalLiquid += amount;
    this.totalSupply += amount;
    this.externalBalance += amount;
  }

  stake(user: number, amount: bigint): void {
    this.liquid[user] -= amount;
    this.activeStake[user] += amount;
    this.totalLiquid -= amount;
    this.totalActiveStake += amount;
  }

  requestUnstake(user: number, amount: bigint): void {
    this.activeStake[user] -= amount;
    this.pendingUnstake[user] += amount;
    this.totalActiveStake -= amount;
    this.totalPendingUnstake += amount;
  }

  claimUnstaked(user: number): void {
    const amount = this.pendingUnstake[user];
    this.pendingUnstake[user] = 0n;
    this.liquid[user] += amount;
    this.totalPendingUnstake -= amount;
    this.totalLiquid += amount;
  }

  withdraw(user: number, debitAmount: bigint): void {
    this.liquid[user] -= debitAmount;
    this.totalLiquid -= debitAmount;
    this.totalSupply -= debitAmount;
    this.externalBalance -= debitAmount;
  }

  reserveProposalBond(user: number, amount: bigint): void {
    this.activeStake[user] -= amount;
    this.proposalBond[user] += amount;
    this.totalActiveStake -= amount;
    this.totalProposalBonds += amount;
  }

  returnProposalBond(user: number, amount: bigint): void {
    this.proposalBond[user] -= amount;
    this.activeStake[user] += amount;
    this.totalProposalBonds -= amount;
    this.totalActiveStake += amount;
  }

  burnProposalBond(user: number, amount: bigint): void {
    this.proposalBond[user] -= amount;
    this.totalProposalBonds -= amount;
    this.totalSupply -= amount;
  }
}

class SeededRandom {
  constructor(private state: number) {}

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }

  int(maxExclusive: number): number {
    return this.next() % maxExclusive;
  }

  amount(min: bigint, max: bigint): bigint {
    const spread = max - min + 1n;
    return min + (BigInt(this.next()) % spread);
  }
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}.`);
  }
  return parsed;
}

function max(first: bigint, second: bigint): bigint {
  return first >= second ? first : second;
}
