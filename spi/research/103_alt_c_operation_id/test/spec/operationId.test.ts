import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  Principal,
  createTestRuntime,
  stopPocketIcServer,
  unwrapOk,
  variantKey,
  type TestRuntime,
} from "../../../../../shared/common/runtime.ts";
import { encodeSpi100Account } from "../../../../../shared/common/spi100.ts";
import { deployOperationBridge, type OperationBridgeFixture } from "../fixtures/actors/operationBridge/operationBridgeHarness.ts";

const IDENTITY_NAMES = ["alice", "bob", "ledger"] as const;
const MIN_DEPOSIT = 10n;
const WITHDRAW_FEE = 2n;

type Opt<T> = [] | [T];
type Env = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  alice: TestRuntime<typeof IDENTITY_NAMES>["identities"]["alice"];
  bob: TestRuntime<typeof IDENTITY_NAMES>["identities"]["bob"];
  ledger: TestRuntime<typeof IDENTITY_NAMES>["identities"]["ledger"];
  bridge: OperationBridgeFixture;
};

type IcrcAccount = {
  owner: Principal;
  subaccount: Opt<Uint8Array | number[]>;
};

describe("103-C operation id extension", () => {
  let env: Env | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("duplicate deposit returns the stored receipt without double credit", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 1n);

    const first = unwrapOk<any>(await depositWithId(env, account, 11n, 100n));
    const second = unwrapOk<any>(await depositWithId(env, account, 11n, 100n));
    expect(second.txIndex).toBe(first.txIndex);
    expect(second.balanceAfter).toBe(first.balanceAfter);
    expect(await walletAmount(env, account)).toBe(100n);
    expect(statusKey(await env.bridge.actor.spi_103_operation_status(11n))).toBe("depositOk");
  });

  test("duplicate withdraw returns the stored receipt without double debit", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 2n);
    await depositWithId(env, account, 21n, 100n);

    const first = unwrapOk<any>(await withdrawWithId(env, account, 22n, 40n));
    const second = unwrapOk<any>(await withdrawWithId(env, account, 22n, 40n));
    expect(second.txIndex).toBe(first.txIndex);
    expect(second.debitAmount).toBe(40n + WITHDRAW_FEE);
    expect(await walletAmount(env, account)).toBe(58n);
    expect(statusKey(await env.bridge.actor.spi_103_operation_status(22n))).toBe("withdrawOk");
  });

  test("reconciliation-needed state is client visible", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 3n);
    await env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
      actor.setup_mark_reconciliation(account, 99n, "lost ledger response"),
    );
    const status = await env.bridge.actor.spi_103_operation_status(99n);
    expect(statusKey(status)).toBe("reconciliationNeeded");
    expect((unwrapOpt(status) as any).reconciliationNeeded.operationId).toBe(99n);
  });

  test("invalid operation id is rejected", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 4n);
    expectErrKey(await depositWithId(env, account, 0n, 100n), "icrcTransferFromRejected");
    expect(await walletAmount(env, account)).toBe(0n);
  });
});

async function setup(): Promise<Env> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi103c",
  });
  const { alice, bob, ledger } = runtime.identities;
  const bridge = await deployOperationBridge(runtime.pic, ledger.getPrincipal(), MIN_DEPOSIT, WITHDRAW_FEE);
  return { runtime, alice, bob, ledger, bridge };
}

async function depositWithId(env: Env, account: Uint8Array, operationId: bigint, amount: bigint) {
  return env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
    actor.spi_103_icrc_deposit_with_id({
      operationId,
      request: {
        account,
        ledger: env.ledger.getPrincipal(),
        from: icrcAccount(env.alice.getPrincipal()),
        amount,
      },
      memo: [],
      createdAtTime: [],
    }),
  );
}

async function withdrawWithId(env: Env, account: Uint8Array, operationId: bigint, amount: bigint) {
  return env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
    actor.spi_103_icrc_withdraw_with_id({
      operationId,
      request: {
        account,
        ledger: env.ledger.getPrincipal(),
        to: icrcAccount(env.bob.getPrincipal()),
        amount,
      },
      memo: [],
      createdAtTime: [],
    }),
  );
}

async function walletAmount(env: Env, account: Uint8Array): Promise<bigint> {
  const result = await env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
    actor.spi_101_wallet({
      account,
      cursor: [],
      limit: [],
      filter: [],
    }),
  );
  const receipt = unwrapOk<any>(result);
  if (receipt.entries.length === 0) {
    return 0n;
  }
  return receipt.entries[0].holding.fungible.amount;
}

function accountFor(wallet: Principal, id: bigint): Uint8Array {
  const account = encodeSpi100Account(wallet, id);
  if (account === null) {
    throw new Error("failed to encode SPI-100 account");
  }
  return new Uint8Array(account);
}

function icrcAccount(owner: Principal, subaccount?: Uint8Array): IcrcAccount {
  return {
    owner,
    subaccount: subaccount === undefined ? [] : [subaccount],
  };
}

function expectErrKey(value: unknown, key: string): void {
  expect(variantKey(value)).toBe("err");
  expect(variantKey((value as { err: unknown }).err)).toBe(key);
}

function statusKey(value: unknown): string {
  return variantKey(unwrapOpt(value));
}

function unwrapOpt(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("expected optional status");
  }
  return value[0];
}
