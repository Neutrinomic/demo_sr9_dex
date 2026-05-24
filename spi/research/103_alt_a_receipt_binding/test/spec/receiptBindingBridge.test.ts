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
import { deployReceiptBridge, type ReceiptBridgeFixture } from "../fixtures/actors/receiptBridge/receiptBridgeHarness.ts";

const IDENTITY_NAMES = ["alice", "bob", "ledger", "unsupportedLedger"] as const;
const MIN_DEPOSIT = 10n;
const WITHDRAW_FEE = 2n;

type Opt<T> = [] | [T];
type Env = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  alice: TestRuntime<typeof IDENTITY_NAMES>["identities"]["alice"];
  bob: TestRuntime<typeof IDENTITY_NAMES>["identities"]["bob"];
  ledger: TestRuntime<typeof IDENTITY_NAMES>["identities"]["ledger"];
  unsupportedLedger: TestRuntime<typeof IDENTITY_NAMES>["identities"]["unsupportedLedger"];
  bridge: ReceiptBridgeFixture;
};

type IcrcAccount = {
  owner: Principal;
  subaccount: Opt<Uint8Array | number[]>;
};

type WalletEntry = {
  node: { ledger: Principal } | { local: Uint8Array };
  holding:
    | { fungible: { amount: bigint; meta: [] } }
    | { nonfungible: { id: bigint; meta: [] } };
  status: unknown;
  displayAsset: Opt<unknown>;
  displayLabel: Opt<string>;
};

type WalletReceipt = {
  account: Uint8Array;
  entries: WalletEntry[];
};

describe("103-A receipt binding bridge", () => {
  let env: Env | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("deposit and withdraw expose bound receipts and wallet state", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 1n);
    const ledger = env.ledger.getPrincipal();
    const to = icrcAccount(env.bob.getPrincipal(), Uint8Array.from(env.runtime.subaccount(7)));

    const deposit = unwrapOk<any>(
      await env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
        actor.spi_103_icrc_deposit({
          account,
          ledger,
          from: icrcAccount(env.alice.getPrincipal()),
          amount: 100n,
        }),
      ),
    );
    expect(bytes(deposit.account)).toEqual(bytes(account));
    expect(deposit.ledger.toText()).toBe(ledger.toText());
    expect(deposit.amount).toBe(100n);
    expect(deposit.balanceAfter).toBe(100n);

    const withdraw = unwrapOk<any>(
      await env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
        actor.spi_103_icrc_withdraw({
          account,
          ledger,
          to,
          amount: 40n,
        }),
      ),
    );
    expect(withdraw.amount).toBe(40n);
    expect(withdraw.fee).toBe(WITHDRAW_FEE);
    expect(withdraw.debitAmount).toBe(40n + WITHDRAW_FEE);
    expect(withdraw.balanceAfter).toBe(58n);
    expect(walletFungibleAmount(await wallet(env, account), ledger)).toBe(58n);
  });

  test("failure guards do not mutate wallet-visible state", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 2n);
    const ledger = env.ledger.getPrincipal();

    expectErrKey(await deposit(env, account, env.unsupportedLedger.getPrincipal(), env.alice.getPrincipal(), 100n), "ledgerNotSupported");
    expectErrKey(await deposit(env, account, ledger, env.bob.getPrincipal(), 100n, env.bob), "accountNotAuthorized");
    expectErrKey(await deposit(env, account, ledger, env.bob.getPrincipal(), 100n), "sourceOwnerMismatch");
    expectErrKey(await deposit(env, account, ledger, env.alice.getPrincipal(), 0n), "zeroAmount");
    expectErrKey(await deposit(env, account, ledger, env.alice.getPrincipal(), 1n), "amountTooLow");

    expect(walletFungibleAmount(await wallet(env, account), ledger)).toBe(0n);
  });

  test("withdraw rejects zero amount and missing fee headroom", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 3n);
    const ledger = env.ledger.getPrincipal();
    await deposit(env, account, ledger, env.alice.getPrincipal(), 50n);

    expectErrKey(
      await env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
        actor.spi_103_icrc_withdraw({
          account,
          ledger,
          to: icrcAccount(env.alice.getPrincipal()),
          amount: 0n,
        }),
      ),
      "zeroAmount",
    );
    expectErrKey(
      await env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
        actor.spi_103_icrc_withdraw({
          account,
          ledger,
          to: icrcAccount(env.alice.getPrincipal()),
          amount: 49n,
        }),
      ),
      "insufficientLocalBalance",
    );
    expect(walletFungibleAmount(await wallet(env, account), ledger)).toBe(50n);
  });
});

async function setup(): Promise<Env> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi103a",
  });
  const { alice, bob, ledger, unsupportedLedger } = runtime.identities;
  return {
    runtime,
    alice,
    bob,
    ledger,
    unsupportedLedger,
    bridge: await deployReceiptBridge(runtime.pic, ledger.getPrincipal(), MIN_DEPOSIT, WITHDRAW_FEE),
  };
}

async function deposit(
  env: Env,
  account: Uint8Array,
  ledger: Principal,
  fromOwner: Principal,
  amount: bigint,
  caller = env.alice,
) {
  return env.runtime.callAs(env.bridge.actor, caller, (actor) =>
    actor.spi_103_icrc_deposit({
      account,
      ledger,
      from: icrcAccount(fromOwner),
      amount,
    }),
  );
}

async function wallet(env: Env, account: Uint8Array): Promise<unknown> {
  return env.runtime.callAs(env.bridge.actor, env.alice, (actor) =>
    actor.spi_101_wallet({
      account,
      cursor: [],
      limit: [],
      filter: [],
    }),
  );
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

function walletFungibleAmount(result: unknown, ledger: Principal): bigint {
  const receipt = unwrapOk<WalletReceipt>(result);
  const found = receipt.entries.find((entry) => {
    if (variantKey(entry.node) !== "ledger") {
      return false;
    }
    return (entry.node as { ledger: Principal }).ledger.toText() === ledger.toText();
  });
  if (found === undefined) {
    return 0n;
  }
  expect(variantKey(found.holding)).toBe("fungible");
  return (found.holding as { fungible: { amount: bigint } }).fungible.amount;
}

function bytes(value: Uint8Array | number[] | ArrayBuffer): number[] {
  return Array.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
}

