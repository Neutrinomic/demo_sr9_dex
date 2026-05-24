import {
  createTestRuntime,
  principalOf,
  type Caller,
  type PocketIc,
  type Principal,
  type TestIdentity,
  type TestRuntime,
} from "../../../../shared/common/runtime.ts";
import { encodeSpi100Account } from "../../../../shared/common/spi100.ts";
import {
  approve,
  deployIcrcLedger,
  type IcrcLedgerFixture,
} from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import { deployDao, type DaoFixture } from "../fixtures/actors/dao/daoHarness.ts";

export const DAO_IDENTITIES = ["controller", "alice", "bob"] as const;

export const DEFAULT_INITIAL_BALANCE = 10_000_000_000n;
export const UNSTAKE_DELAY_SECONDS = 604_800;

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
  initialExternalBalance?: bigint;
  ledgerFee?: bigint;
};

export async function setupDaoE2E(
  opts: SetupDaoE2EOptions = {},
): Promise<DaoE2E> {
  const runtime = await createTestRuntime({
    identities: DAO_IDENTITIES,
    identityPrefix: "dao-current",
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
  const dao = await deployDao(pic, ledger.canisterId, 1n, 1n);

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
  account: Uint8Array,
  amount: bigint,
): Promise<unknown> {
  await approve(env.ledger, user, env.dao.canisterId, amount + env.ledger.fee);
  return env.runtime.callAs(env.dao.actor, user, (actor) =>
    actor.spi_103_icrc_deposit({
      account,
      ledger: env.ledger.canisterId,
      from: env.runtime.account(user),
      amount,
    }),
  );
}

export function accountFor(wallet: Principal, id: bigint): Uint8Array {
  const account = encodeSpi100Account(wallet, id);
  if (account === null) {
    throw new Error("failed to encode SPI-100 account");
  }
  return new Uint8Array(account);
}

export function callerPrincipal(caller: Caller): Principal {
  return principalOf(caller);
}
