import {
  createTestRuntime,
  principalOf,
  type Caller,
  type PocketIc,
  type Principal,
  type TestIdentity,
  type TestRuntime,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import {
  approve,
  deployIcrcLedger,
  type IcrcLedgerFixture,
} from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import { deployDao, type DaoFixture } from "../fixtures/actors/dao/daoHarness.ts";

export const DAO_IDENTITIES = ["controller", "alice", "bob"] as const;

export const DEFAULT_INITIAL_BALANCE = 10_000_000_000n;
export const VOTING_LOCK_SECONDS = 604_800n;
export const PROPOSAL_PERIOD_SECONDS = 259_200n;
export const NANOS_PER_MILLI = 1_000_000n;

export type DaoE2E = {
  runtime: TestRuntime<typeof DAO_IDENTITIES>;
  pic: PocketIc;
  controller: TestIdentity;
  alice: TestIdentity;
  bob: TestIdentity;
  dao: DaoFixture;
  ledger: IcrcLedgerFixture;
};

export type SetupDaoE2EOptions = {
  initialQuorumVotes?: bigint;
  initialProposalThreshold?: bigint;
  initialExternalBalance?: bigint;
  ledgerFee?: bigint;
};

export async function setupDaoE2E(
  opts: SetupDaoE2EOptions = {},
): Promise<DaoE2E> {
  const runtime = await createTestRuntime({
    identities: DAO_IDENTITIES,
    identityPrefix: "dao",
  });
  const { pic, identities } = runtime;
  const { controller, alice, bob } = identities;

  const ledger = await deployIcrcLedger(pic, {
    controller,
    symbol: "GOV",
    name: "Governance Token",
    fee: opts.ledgerFee,
    mintingAccount: runtime.account("controller", runtime.subaccount(99n)),
    initialBalances: [
      { owner: alice, amount: opts.initialExternalBalance ?? DEFAULT_INITIAL_BALANCE },
      { owner: bob, amount: opts.initialExternalBalance ?? DEFAULT_INITIAL_BALANCE },
    ],
  });
  const dao = await deployDao(
    pic,
    ledger.canisterId,
    opts.initialQuorumVotes ?? 1n,
    opts.initialProposalThreshold ?? 1n,
  );

  return {
    runtime,
    pic,
    controller,
    alice,
    bob,
    dao,
    ledger,
  };
}

export async function approveAndDeposit(
  env: DaoE2E,
  user: Caller,
  amount: bigint,
): Promise<unknown> {
  await approve(env.ledger, user, env.dao.canisterId, amount + env.ledger.fee);
  env.runtime.as(env.dao.actor, user);
  return env.dao.actor.spi_101_deposit({
    subject: principalOf(user),
    ledger: env.ledger.canisterId,
    from: env.runtime.account(user),
    amount,
  });
}

export async function deposit(
  env: DaoE2E,
  user: Caller,
  amount: bigint,
): Promise<unknown> {
  env.runtime.as(env.dao.actor, user);
  return env.dao.actor.spi_101_deposit({
    subject: principalOf(user),
    ledger: env.ledger.canisterId,
    from: env.runtime.account(user),
    amount,
  });
}

export async function withdraw(
  env: DaoE2E,
  user: Caller,
  amount: bigint,
): Promise<unknown> {
  env.runtime.as(env.dao.actor, user);
  return env.dao.actor.spi_101_withdraw({
    subject: principalOf(user),
    ledger: env.ledger.canisterId,
    to: env.runtime.account(user),
    amount,
  });
}

export async function stake(
  env: DaoE2E,
  user: Caller,
  amount: bigint,
): Promise<unknown> {
  env.runtime.as(env.dao.actor, user);
  return env.dao.actor.stake(principalOf(user), amount);
}

export async function requestUnstake(
  env: DaoE2E,
  user: Caller,
  amount: bigint,
): Promise<unknown> {
  env.runtime.as(env.dao.actor, user);
  return env.dao.actor.request_unstake(principalOf(user), amount);
}

export async function claimUnstaked(
  env: DaoE2E,
  user: Caller,
): Promise<unknown> {
  env.runtime.as(env.dao.actor, user);
  return env.dao.actor.claim_unstaked(principalOf(user));
}

export async function createProposal(
  env: DaoE2E,
  user: Caller,
  action: unknown,
): Promise<unknown> {
  env.runtime.as(env.dao.actor, user);
  return env.dao.actor.create_proposal(principalOf(user), action);
}

export async function vote(
  env: DaoE2E,
  user: Caller,
  id: bigint,
  choice: unknown,
): Promise<unknown> {
  env.runtime.as(env.dao.actor, user);
  return env.dao.actor.vote(principalOf(user), id, choice);
}

export async function depositStakeAndMature(
  env: DaoE2E,
  user: Caller,
  amount: bigint,
): Promise<any> {
  unwrapOk(await approveAndDeposit(env, user, amount));
  const receipt = unwrapOk<any>(await stake(env, user, amount));
  await setTimeNanos(env, receipt.votingPowerUnlockAt);
  return receipt;
}

export async function setTimeNanos(env: DaoE2E, nanos: bigint): Promise<void> {
  await env.runtime.time.set(Number((nanos + NANOS_PER_MILLI) / NANOS_PER_MILLI), { ticks: 2 });
}

export function expectErrKey(result: unknown, key: string): void {
  if (variantKey(result) !== "err") {
    throw new Error(`expected #err #${key}, got ${String(result)}`);
  }
  const actual = variantKey((result as { err: unknown }).err);
  if (actual !== key) {
    throw new Error(`expected #err #${key}, got #${actual}`);
  }
}

export function principalText(principal: Principal): string {
  return principal.toText();
}
