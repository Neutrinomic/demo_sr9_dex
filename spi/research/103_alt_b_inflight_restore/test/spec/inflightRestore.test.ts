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
import { deployBridge, type BridgeFixture } from "../fixtures/actors/bridge/bridgeHarness.ts";
import { deployMockLedger, type MockLedgerFixture } from "../fixtures/actors/mockLedger/mockLedgerHarness.ts";

const IDENTITY_NAMES = ["alice", "bob"] as const;
const MIN_DEPOSIT = 10n;
const FEE = 2n;

type Opt<T> = [] | [T];
type Env = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  alice: TestRuntime<typeof IDENTITY_NAMES>["identities"]["alice"];
  bob: TestRuntime<typeof IDENTITY_NAMES>["identities"]["bob"];
  ledger: MockLedgerFixture;
  bridge: BridgeFixture;
};

type IcrcAccount = {
  owner: Principal;
  subaccount: Opt<Uint8Array | number[]>;
};

describe("103-B in-flight restore bridge", () => {
  let env: Env | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("successful deposit and withdraw pass through the mock ledger", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 1n);
    const ledger = env.ledger.canisterId;

    const depositReceipt = unwrapOk<any>(await deposit(env, account, 100n));
    expect(depositReceipt.balanceAfter).toBe(100n);

    const withdrawReceipt = unwrapOk<any>(
      await env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
        actor.spi_103_icrc_withdraw({
          account,
          ledger,
          to: icrcAccount(env.bob.getPrincipal()),
          amount: 40n,
        }),
      ),
    );
    expect(withdrawReceipt.fee).toBe(FEE);
    expect(withdrawReceipt.debitAmount).toBe(42n);
    expect(await walletAmount(env, account)).toBe(58n);
    expect(await env.bridge.actor.raw_pending()).toEqual([]);
  });

  test("deposit ledger error and reject create no credit", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 2n);

    await env.ledger.actor.set_mode({ transferFromErr: null });
    expectErrKey(await deposit(env, account, 100n), "icrcTransferFromErr");
    expect(await walletAmount(env, account)).toBe(0n);

    await env.ledger.actor.set_mode({ transferFromReject: null });
    expectErrKey(await deposit(env, account, 100n), "icrcTransferFromRejected");
    expect(await walletAmount(env, account)).toBe(0n);
  });

  test("withdraw fee reject and transfer failures restore wallet balance", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 3n);
    await deposit(env, account, 100n);

    await env.ledger.actor.set_mode({ feeReject: null });
    expectErrKey(await withdraw(env, account, 40n), "icrcFeeRejected");
    expect(await walletAmount(env, account)).toBe(100n);
    expect(await env.bridge.actor.raw_pending()).toEqual([]);

    await env.ledger.actor.set_mode({ transferErr: null });
    expectErrKey(await withdraw(env, account, 40n), "icrcTransferErr");
    expect(await walletAmount(env, account)).toBe(100n);
    expect(await env.bridge.actor.raw_pending()).toEqual([]);

    await env.ledger.actor.set_mode({ transferReject: null });
    expectErrKey(await withdraw(env, account, 40n), "icrcTransferRejected");
    expect(await walletAmount(env, account)).toBe(100n);
    expect(await env.bridge.actor.raw_pending()).toEqual([]);
  });

  test("guards zero amounts and missing local balance", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 4n);
    expectErrKey(await deposit(env, account, 0n), "zeroAmount");
    expectErrKey(await withdraw(env, account, 0n), "zeroAmount");
    expectErrKey(await withdraw(env, account, 5n), "insufficientLocalBalance");
  });
});

async function setup(): Promise<Env> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi103b",
  });
  const { alice, bob } = runtime.identities;
  const ledger = await deployMockLedger(runtime.pic, FEE);
  const bridge = await deployBridge(runtime.pic, ledger.canisterId, MIN_DEPOSIT);
  return { runtime, alice, bob, ledger, bridge };
}

async function deposit(env: Env, account: Uint8Array, amount: bigint) {
  return env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
    actor.spi_103_icrc_deposit({
      account,
      ledger: env.ledger.canisterId,
      from: icrcAccount(env.alice.getPrincipal()),
      amount,
    }),
  );
}

async function withdraw(env: Env, account: Uint8Array, amount: bigint) {
  return env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
    actor.spi_103_icrc_withdraw({
      account,
      ledger: env.ledger.canisterId,
      to: icrcAccount(env.bob.getPrincipal()),
      amount,
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
  if (variantKey(result) !== "ok") {
    throw new Error("wallet failed");
  }
  const entries = (result as any).ok.entries as any[];
  if (entries.length === 0) {
    return 0n;
  }
  expect(variantKey(entries[0].node)).toBe("ledger");
  expect(variantKey(entries[0].holding)).toBe("fungible");
  return entries[0].holding.fungible.amount;
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

