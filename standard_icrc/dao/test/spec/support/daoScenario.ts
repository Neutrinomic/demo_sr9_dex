import { expect } from "bun:test";
import {
  createTestRuntime,
  Principal,
  principalOf,
  testIdentity,
  type Caller,
  type TestIdentity,
  type TestRuntime,
  unwrapOk,
  variantKey,
} from "../../../../../shared/common/runtime.ts";
import {
  approve,
  balanceOf,
  deployIcrcLedger,
  transfer,
  type IcrcLedgerFixture,
} from "../../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import { deployDao, type DaoFixture } from "../../fixtures/actors/dao/daoHarness.ts";
import { NANOS_PER_MILLI } from "../daoTestEnv.ts";

export type CreateDaoScenarioOptions = {
  name: string;
  userCount?: number;
  initialExternalBalance?: bigint;
  ledgerFee?: bigint;
  initialQuorumVotes?: bigint;
  initialProposalThreshold?: bigint;
};

export type DaoScenario = {
  runtime: TestRuntime<readonly ["controller"]>;
  controller: TestIdentity;
  users: TestIdentity[];
  dao: DaoFixture;
  ledger: IcrcLedgerFixture;
  model: DaoModel;
  tearDown(): Promise<void>;
  approveAndDeposit(user: number | Caller, amount: bigint): Promise<unknown>;
  deposit(user: number | Caller, amount: bigint): Promise<unknown>;
  withdraw(user: number | Caller, amount: bigint): Promise<unknown>;
  stake(user: number | Caller, amount: bigint): Promise<unknown>;
  requestUnstake(user: number | Caller, amount: bigint): Promise<unknown>;
  claimUnstaked(user: number | Caller): Promise<unknown>;
  createProposal(user: number | Caller, action: ConfigActionLike): Promise<unknown>;
  vote(user: number | Caller, id: bigint, choice: VoteChoiceLike): Promise<unknown>;
  close(id: bigint): Promise<unknown>;
  execute(id: bigint): Promise<unknown>;
  directTransfer(user: number | Caller, amount: bigint): Promise<bigint>;
  matureAt(nanos: bigint): Promise<void>;
  matureUser(user: number | Caller): Promise<void>;
  assertUser(user: number | Caller): Promise<void>;
  assertProposal(id: bigint): Promise<void>;
  assertTotals(): Promise<void>;
  assertExternal(): Promise<void>;
  assertAll(): Promise<void>;
};

export type ConfigActionLike =
  | { setQuorum: bigint }
  | { setProposalThreshold: bigint }
  | { setConfig: { quorumVotes: bigint; proposalThreshold: bigint } };

export type VoteChoiceLike = { yes: null } | { no: null };

type ConfigModel = {
  quorumVotes: bigint;
  proposalThreshold: bigint;
};

type PendingUnstakeModel = {
  amount: bigint;
  unlockAt: bigint;
};

type PendingWithdrawModel = {
  amount: bigint;
  fee: bigint;
  debitAmount: bigint;
  createdAtTime: bigint;
};

type VoteModel = {
  choice: "yes" | "no";
  weight: bigint;
};

type ProposalStatus = "open" | "passed" | "failed" | "executed" | "stale";

type ProposalModel = {
  id: bigint;
  proposer: Principal;
  action: ConfigActionLike;
  yesVotes: bigint;
  noVotes: bigint;
  quorumVotes: bigint;
  snapshotActiveStake: bigint;
  configVersion: bigint;
  bond: bigint;
  createdAt: bigint;
  deadline: bigint;
  status: ProposalStatus;
  votes: Map<string, VoteModel>;
};

export class DaoModel {
  readonly liquid = new Map<string, bigint>();
  readonly activeStake = new Map<string, bigint>();
  readonly votingUnlocks = new Map<string, bigint>();
  readonly pendingUnstake = new Map<string, PendingUnstakeModel>();
  readonly pendingWithdraw = new Map<string, PendingWithdrawModel>();
  readonly proposalBonds = new Map<string, bigint>();
  readonly proposals = new Map<bigint, ProposalModel>();
  readonly touchedUsers: Principal[] = [];
  daoLedgerBalance = 0n;
  nextProposalId = 0n;
  configVersion = 0n;

  constructor(readonly config: ConfigModel) {}

  key(user: Principal): string {
    return user.toText();
  }

  remember(user: Principal): void {
    const key = this.key(user);
    if (!this.touchedUsers.some((seen) => seen.toText() === key)) {
      this.touchedUsers.push(user);
    }
  }

  get(map: Map<string, bigint>, user: Principal): bigint {
    return map.get(this.key(user)) ?? 0n;
  }

  set(map: Map<string, bigint>, user: Principal, value: bigint): void {
    map.set(this.key(user), value);
    this.remember(user);
  }

  totalLiquid(): bigint {
    return sum(this.liquid.values());
  }

  totalActiveStake(): bigint {
    return sum(this.activeStake.values());
  }

  totalPendingUnstake(): bigint {
    let total = 0n;
    for (const pending of this.pendingUnstake.values()) {
      total += pending.amount;
    }
    return total;
  }

  totalPendingWithdraw(): bigint {
    let total = 0n;
    for (const pending of this.pendingWithdraw.values()) {
      total += pending.debitAmount;
    }
    return total;
  }

  totalProposalBonds(): bigint {
    return sum(this.proposalBonds.values());
  }

  totalSupply(): bigint {
    return (
      this.totalLiquid() +
      this.totalActiveStake() +
      this.totalPendingUnstake() +
      this.totalPendingWithdraw() +
      this.totalProposalBonds()
    );
  }

  activeVoteLock(user: Principal): bigint {
    const key = this.key(user);
    let locked = 0n;
    for (const proposal of this.proposals.values()) {
      if (proposal.status !== "open") {
        continue;
      }
      const vote = proposal.votes.get(key);
      if (vote !== undefined && vote.weight > locked) {
        locked = vote.weight;
      }
    }
    return locked;
  }
}

export async function createDaoScenario(
  opts: CreateDaoScenarioOptions,
): Promise<DaoScenario> {
  const userCount = opts.userCount ?? 3;
  const initialExternalBalance = opts.initialExternalBalance ?? 10_000_000_000n;
  const ledgerFee = opts.ledgerFee ?? 10_000n;
  const quorumVotes = normalizeConfigValue(opts.initialQuorumVotes ?? 1n);
  const proposalThreshold = normalizeConfigValue(opts.initialProposalThreshold ?? 1n);
  const runtime = await createTestRuntime({
    identities: ["controller"] as const,
    identityPrefix: `dao-${opts.name}`,
  });
  const controller = runtime.identities.controller;
  const users = Array.from({ length: userCount }, (_, i) =>
    testIdentity(`${opts.name}-user-${i}`),
  );
  const ledger = await deployIcrcLedger(runtime.pic, {
    controller,
    symbol: "GOV",
    name: "Governance Token",
    fee: ledgerFee,
    mintingAccount: runtime.account(controller, runtime.subaccount(99n)),
    initialBalances: users.map((user) => ({
      owner: user,
      amount: initialExternalBalance,
    })),
  });
  const dao = await deployDao(runtime.pic, ledger.canisterId, quorumVotes, proposalThreshold);
  const model = new DaoModel({
    quorumVotes,
    proposalThreshold,
  });

  const scenario: DaoScenario = {
    runtime,
    controller,
    users,
    dao,
    ledger,
    model,
    async tearDown(): Promise<void> {
      await runtime.tearDown();
    },
    async approveAndDeposit(userRef, amount): Promise<unknown> {
      const user = resolveUser(users, userRef);
      await approve(ledger, user, dao.canisterId, amount + ledger.fee);
      return scenario.deposit(user, amount);
    },
    async deposit(userRef, amount): Promise<unknown> {
      const user = resolveUser(users, userRef);
      const principal = principalOf(user);
      runtime.as(dao.actor, user);
      const result = await dao.actor.spi_101_deposit({
        subject: principal,
        ledger: ledger.canisterId,
        from: runtime.account(user),
        amount,
      });
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as DepositReceiptLike;
        model.set(model.liquid, principal, model.get(model.liquid, principal) + receipt.amount);
        model.daoLedgerBalance += receipt.amount;
      }
      await scenario.assertUser(user);
      await scenario.assertTotals();
      await scenario.assertExternal();
      return result;
    },
    async withdraw(userRef, amount): Promise<unknown> {
      const user = resolveUser(users, userRef);
      const principal = principalOf(user);
      runtime.as(dao.actor, user);
      const result = await dao.actor.spi_101_withdraw({
        subject: principal,
        ledger: ledger.canisterId,
        to: runtime.account(user),
        amount,
      });
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as WithdrawReceiptLike;
        model.set(
          model.liquid,
          principal,
          model.get(model.liquid, principal) - receipt.debitAmount,
        );
        model.daoLedgerBalance -= receipt.debitAmount;
      }
      await scenario.assertUser(user);
      await scenario.assertTotals();
      await scenario.assertExternal();
      return result;
    },
    async stake(userRef, amount): Promise<unknown> {
      const user = resolveUser(users, userRef);
      const principal = principalOf(user);
      runtime.as(dao.actor, user);
      const result = await dao.actor.stake(principal, amount);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as StakeReceiptLike;
        model.set(model.liquid, principal, model.get(model.liquid, principal) - receipt.amount);
        model.set(
          model.activeStake,
          principal,
          model.get(model.activeStake, principal) + receipt.amount,
        );
        model.votingUnlocks.set(model.key(principal), receipt.votingPowerUnlockAt);
      }
      await scenario.assertUser(user);
      await scenario.assertTotals();
      return result;
    },
    async requestUnstake(userRef, amount): Promise<unknown> {
      const user = resolveUser(users, userRef);
      const principal = principalOf(user);
      runtime.as(dao.actor, user);
      const result = await dao.actor.request_unstake(principal, amount);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as RequestUnstakeReceiptLike;
        model.set(model.activeStake, principal, receipt.activeStake);
        model.pendingUnstake.set(model.key(principal), {
          amount: receipt.pendingUnstake,
          unlockAt: receipt.unlockAt,
        });
      }
      await scenario.assertUser(user);
      await scenario.assertTotals();
      return result;
    },
    async claimUnstaked(userRef): Promise<unknown> {
      const user = resolveUser(users, userRef);
      const principal = principalOf(user);
      runtime.as(dao.actor, user);
      const result = await dao.actor.claim_unstaked(principal);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as ClaimUnstakeReceiptLike;
        model.pendingUnstake.delete(model.key(principal));
        model.set(model.liquid, principal, receipt.liquidBalance);
      }
      await scenario.assertUser(user);
      await scenario.assertTotals();
      return result;
    },
    async createProposal(userRef, action): Promise<unknown> {
      const user = resolveUser(users, userRef);
      const principal = principalOf(user);
      runtime.as(dao.actor, user);
      const result = await dao.actor.create_proposal(principal, action);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as ProposalReceiptLike;
        const bond = model.config.proposalThreshold;
        model.set(model.activeStake, principal, model.get(model.activeStake, principal) - bond);
        model.set(model.proposalBonds, principal, model.get(model.proposalBonds, principal) + bond);
        model.proposals.set(receipt.id, {
          id: receipt.id,
          proposer: principal,
          action,
          yesVotes: 0n,
          noVotes: 0n,
          quorumVotes: receipt.quorumVotes,
          snapshotActiveStake: receipt.snapshotActiveStake,
          configVersion: receipt.configVersion,
          bond,
          createdAt: receipt.createdAt,
          deadline: receipt.deadline,
          status: "open",
          votes: new Map(),
        });
        model.nextProposalId = receipt.id + 1n;
      }
      await scenario.assertUser(user);
      await scenario.assertTotals();
      if (hasVariant(result, "ok")) {
        await scenario.assertProposal((result.ok as ProposalReceiptLike).id);
      }
      return result;
    },
    async vote(userRef, id, choice): Promise<unknown> {
      const user = resolveUser(users, userRef);
      const principal = principalOf(user);
      runtime.as(dao.actor, user);
      const result = await dao.actor.vote(principal, id, choice);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as VoteReceiptLike;
        const proposal = mustProposal(model, id);
        proposal.yesVotes = receipt.yesVotes;
        proposal.noVotes = receipt.noVotes;
        proposal.votes.set(model.key(principal), {
          choice: choiceKey(receipt.choice),
          weight: receipt.weight,
        });
      }
      await scenario.assertUser(user);
      await scenario.assertTotals();
      await scenario.assertProposal(id);
      return result;
    },
    async close(id): Promise<unknown> {
      const result = await dao.actor.close(id);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as CloseReceiptLike;
        const proposal = mustProposal(model, id);
        proposal.status = statusKey(receipt.status);
        if (proposal.status === "failed" && proposal.bond > 0n) {
          const proposer = proposal.proposer;
          model.set(
            model.proposalBonds,
            proposer,
            model.get(model.proposalBonds, proposer) - proposal.bond,
          );
          proposal.bond = 0n;
        }
      }
      await scenario.assertTotals();
      await scenario.assertProposal(id);
      return result;
    },
    async execute(id): Promise<unknown> {
      const result = await dao.actor.execute(id);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as ExecuteReceiptLike;
        const proposal = mustProposal(model, id);
        const proposer = proposal.proposer;
        model.set(
          model.proposalBonds,
          proposer,
          model.get(model.proposalBonds, proposer) - proposal.bond,
        );
        model.set(
          model.activeStake,
          proposer,
          model.get(model.activeStake, proposer) + proposal.bond,
        );
        proposal.bond = 0n;
        if (receipt.applied) {
          proposal.status = "executed";
          model.config.quorumVotes = nextQuorum(model.config, proposal.action);
          model.config.proposalThreshold = nextThreshold(model.config, proposal.action);
          model.configVersion = receipt.configVersion;
        } else {
          proposal.status = "stale";
        }
      }
      await scenario.assertTotals();
      await scenario.assertProposal(id);
      return result;
    },
    async directTransfer(userRef, amount): Promise<bigint> {
      const user = resolveUser(users, userRef);
      const tx = await transfer(ledger, user, dao.canisterId, amount);
      model.daoLedgerBalance += amount;
      await scenario.assertUser(user);
      await scenario.assertTotals();
      await scenario.assertExternal();
      return tx;
    },
    async matureAt(nanos): Promise<void> {
      const now = await runtime.time.nowNanos();
      if (nanos <= now) {
        await runtime.block(2);
        return;
      }
      await runtime.time.set(Number((nanos + NANOS_PER_MILLI) / NANOS_PER_MILLI), { ticks: 2 });
    },
    async matureUser(userRef): Promise<void> {
      const user = principalOf(resolveUser(users, userRef));
      const unlock = model.votingUnlocks.get(model.key(user));
      if (unlock !== undefined) {
        await scenario.matureAt(unlock);
      }
    },
    async assertUser(userRef): Promise<void> {
      await assertUser(scenario, principalOf(resolveUser(users, userRef)));
    },
    async assertProposal(id): Promise<void> {
      await assertProposal(scenario, id);
    },
    async assertTotals(): Promise<void> {
      await assertTotals(scenario);
    },
    async assertExternal(): Promise<void> {
      await assertExternal(scenario);
    },
    async assertAll(): Promise<void> {
      for (const user of model.touchedUsers) {
        await assertUser(scenario, user);
      }
      for (const id of model.proposals.keys()) {
        await assertProposal(scenario, id);
      }
      await assertTotals(scenario);
      await assertExternal(scenario);
    },
  };

  return scenario;
}

async function assertUser(scenario: DaoScenario, user: Principal): Promise<void> {
  const { dao, model, runtime } = scenario;
  const key = model.key(user);
  const active = model.get(model.activeStake, user);
  const pending = model.pendingUnstake.get(key);
  const pendingWithdraw = model.pendingWithdraw.get(key);
  const votingUnlock = model.votingUnlocks.get(key);
  expect(await dao.actor.stake_info(user)).toEqual({
    liquid: model.get(model.liquid, user),
    activeStake: active,
    proposalBond: model.get(model.proposalBonds, user),
    pendingUnstake: pending?.amount ?? 0n,
    pendingWithdraw: pendingWithdraw?.debitAmount ?? 0n,
    activeVoteLock: model.activeVoteLock(user),
    votingPowerUnlockAt: active === 0n || votingUnlock === undefined ? [] : [votingUnlock],
    unlockAt: pending === undefined ? [] : [pending.unlockAt],
  });
  const now = await runtime.time.nowNanos();
  const expectedVotingPower =
    active > 0n && votingUnlock !== undefined && now >= votingUnlock ? active : 0n;
  expect(await dao.actor.voting_power(user)).toBe(expectedVotingPower);
  const actualPending = await dao.actor.pending_withdrawal(user);
  expect(actualPending).toEqual(pendingWithdraw === undefined ? [] : [pendingWithdraw]);
}

async function assertProposal(scenario: DaoScenario, id: bigint): Promise<void> {
  const proposal = scenario.model.proposals.get(id);
  const actualOpt = await scenario.dao.actor.proposal(id);
  if (proposal === undefined) {
    expect(actualOpt).toEqual([]);
    return;
  }
  const actual = actualOpt[0];
  expect(actual).toEqual({
    id: proposal.id,
    proposer: proposal.proposer.toText(),
    action: proposal.action,
    yesVotes: proposal.yesVotes,
    noVotes: proposal.noVotes,
    quorumVotes: proposal.quorumVotes,
    snapshotActiveStake: proposal.snapshotActiveStake,
    configVersion: proposal.configVersion,
    bond: proposal.bond,
    createdAt: proposal.createdAt,
    deadline: proposal.deadline,
    status: { [proposal.status]: null },
  });
  for (const [userKey, vote] of proposal.votes) {
    const info = await scenario.dao.actor.vote_info(id, Principal.fromText(userKey));
    expect(info).toEqual({
      hasVoted: true,
      choice: [{ [vote.choice]: null }],
      voteWeight: vote.weight,
      lockedStake: proposal.status === "open" ? vote.weight : 0n,
    });
  }
}

async function assertTotals(scenario: DaoScenario): Promise<void> {
  const { dao, model } = scenario;
  expect(await dao.actor.dao_totals()).toEqual({
    totalSupply: model.totalSupply(),
    totalLiquid: model.totalLiquid(),
    totalActiveStake: model.totalActiveStake(),
    totalPendingUnstake: model.totalPendingUnstake(),
    totalPendingWithdraw: model.totalPendingWithdraw(),
    totalProposalBonds: model.totalProposalBonds(),
  });
  expect(await dao.actor.proposal_config()).toEqual(model.config);
  expect(await dao.actor.config_version()).toBe(model.configVersion);
  expect(await dao.actor.proposal_window()).toEqual({
    nextProposalId: model.nextProposalId,
    maxProposals: 32n,
  });
}

async function assertExternal(scenario: DaoScenario): Promise<void> {
  expect(await balanceOf(scenario.ledger, scenario.dao.canisterId)).toBe(
    scenario.model.daoLedgerBalance,
  );
}

function resolveUser(users: TestIdentity[], user: number | Caller): Caller {
  return typeof user === "number" ? users[user] : user;
}

function hasVariant(value: unknown, key: string): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && key in value;
}

function mustProposal(model: DaoModel, id: bigint): ProposalModel {
  const proposal = model.proposals.get(id);
  if (proposal === undefined) {
    throw new Error(`model has no proposal ${id}`);
  }
  return proposal;
}

function choiceKey(choice: VoteChoiceLike): "yes" | "no" {
  return variantKey(choice) as "yes" | "no";
}

function statusKey(status: unknown): ProposalStatus {
  return variantKey(status) as ProposalStatus;
}

function normalizeConfigValue(value: bigint): bigint {
  return value === 0n ? 1n : value;
}

function nextQuorum(config: ConfigModel, action: ConfigActionLike): bigint {
  if ("setQuorum" in action) {
    return action.setQuorum;
  }
  if ("setProposalThreshold" in action) {
    return config.quorumVotes;
  }
  return action.setConfig.quorumVotes;
}

function nextThreshold(config: ConfigModel, action: ConfigActionLike): bigint {
  if ("setQuorum" in action) {
    return config.proposalThreshold;
  }
  if ("setProposalThreshold" in action) {
    return action.setProposalThreshold;
  }
  return action.setConfig.proposalThreshold;
}

function sum(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) {
    total += value;
  }
  return total;
}

type DepositReceiptLike = {
  amount: bigint;
};

type WithdrawReceiptLike = {
  debitAmount: bigint;
};

type StakeReceiptLike = {
  amount: bigint;
  votingPowerUnlockAt: bigint;
};

type RequestUnstakeReceiptLike = {
  activeStake: bigint;
  pendingUnstake: bigint;
  unlockAt: bigint;
};

type ClaimUnstakeReceiptLike = {
  liquidBalance: bigint;
};

type ProposalReceiptLike = {
  id: bigint;
  quorumVotes: bigint;
  snapshotActiveStake: bigint;
  configVersion: bigint;
  createdAt: bigint;
  deadline: bigint;
};

type ExecuteReceiptLike = {
  configVersion: bigint;
  applied: boolean;
};

type VoteReceiptLike = {
  choice: VoteChoiceLike;
  weight: bigint;
  yesVotes: bigint;
  noVotes: bigint;
};

type CloseReceiptLike = {
  status: unknown;
};
