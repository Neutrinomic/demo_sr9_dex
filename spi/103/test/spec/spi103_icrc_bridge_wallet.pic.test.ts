import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  Principal,
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import { encodeSpi100Account } from "../../../../shared/common/spi100.ts";
import {
  setupSpi103E2E,
  WITHDRAW_FEE,
  type Spi103E2E,
} from "./spi103TestEnv.ts";

type Opt<T> = [] | [T];

type IcrcAccount = {
  owner: Principal;
  subaccount: Opt<Uint8Array | number[]>;
};

type WalletEntry = {
  node: { ledger: Principal } | { local: Uint8Array };
  holding:
    | { fungible: { amount: bigint; meta: null } }
    | { nonfungible: { id: bigint; meta: null } };
  status: unknown;
  displayAsset: Opt<unknown>;
  displayLabel: Opt<string>;
};

type WalletReceipt = {
  account: Uint8Array;
  entries: WalletEntry[];
};

describe("SPI-103 ICRC bridge plus SPI-101 wallet", () => {
  let env: Spi103E2E | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("deposit credits the SPI-101 ledger wallet node", async () => {
    env = await setupSpi103E2E();
    const account = accountFor(env.alice.getPrincipal(), 1n);
    const ledger = env.ledger.getPrincipal();

    const receipt = unwrapOk<any>(
      await env.runtime.callAs(env.icrcWallet.actor, env.alice, (actor) =>
        actor.spi_103_icrc_deposit({
          account,
          ledger,
          from: icrcAccount(env.alice.getPrincipal()),
          amount: 100n,
        }),
      ),
    );

    expect(bytes(receipt.account)).toEqual(bytes(account));
    expect(receipt.ledger.toText()).toBe(ledger.toText());
    expect(receipt.amount).toBe(100n);
    expect(receipt.balanceAfter).toBe(100n);
    expect(walletFungibleAmount(await wallet(env, account), ledger)).toBe(100n);
  });

  test("withdraw debits amount plus fee from the SPI-101 wallet", async () => {
    env = await setupSpi103E2E();
    const account = accountFor(env.alice.getPrincipal(), 2n);
    const ledger = env.ledger.getPrincipal();
    const bobSubaccount = Uint8Array.from(env.runtime.subaccount(7));

    await deposit(env, account, 100n);
    const receipt = unwrapOk<any>(
      await env.runtime.callAs(env.icrcWallet.actor, env.alice, (actor) =>
        actor.spi_103_icrc_withdraw({
          account,
          ledger,
          to: icrcAccount(env.bob.getPrincipal(), bobSubaccount),
          amount: 40n,
        }),
      ),
    );

    expect(receipt.amount).toBe(40n);
    expect(receipt.fee).toBe(WITHDRAW_FEE);
    expect(receipt.debitAmount).toBe(40n + WITHDRAW_FEE);
    expect(receipt.balanceAfter).toBe(58n);
    expect(walletFungibleAmount(await wallet(env, account), ledger)).toBe(58n);
  });

  test("unsupported ledgers and unauthorized callers do not mutate wallet state", async () => {
    env = await setupSpi103E2E();
    const account = accountFor(env.alice.getPrincipal(), 3n);
    const ledger = env.ledger.getPrincipal();

    expectErrKey(
      await env.runtime.callAs(env.icrcWallet.actor, env.alice, (actor) =>
        actor.spi_103_icrc_deposit({
          account,
          ledger: env.unsupportedLedger.getPrincipal(),
          from: icrcAccount(env.alice.getPrincipal()),
          amount: 100n,
        }),
      ),
      "ledgerNotSupported",
    );
    expectErrKey(
      await env.runtime.callAs(env.icrcWallet.actor, env.bob, (actor) =>
        actor.spi_103_icrc_deposit({
          account,
          ledger,
          from: icrcAccount(env.bob.getPrincipal()),
          amount: 100n,
        }),
      ),
      "accountNotAuthorized",
    );
    expectErrKey(
      await env.runtime.callAs(env.icrcWallet.actor, env.alice, (actor) =>
        actor.spi_103_icrc_deposit({
          account,
          ledger,
          from: icrcAccount(env.bob.getPrincipal()),
          amount: 100n,
        }),
      ),
      "sourceOwnerMismatch",
    );

    expect(walletFungibleAmount(await wallet(env, account), ledger)).toBe(0n);
  });

  test("withdraw guards zero amount and fee headroom", async () => {
    env = await setupSpi103E2E();
    const account = accountFor(env.alice.getPrincipal(), 4n);
    const ledger = env.ledger.getPrincipal();

    await deposit(env, account, 50n);
    expectErrKey(
      await env.runtime.callAs(env.icrcWallet.actor, env.alice, (actor) =>
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
      await env.runtime.callAs(env.icrcWallet.actor, env.alice, (actor) =>
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

async function deposit(env: Spi103E2E, account: Uint8Array, amount: bigint) {
  return env.runtime.callAs(env.icrcWallet.actor, env.alice, (actor) =>
    actor.spi_103_icrc_deposit({
      account,
      ledger: env.ledger.getPrincipal(),
      from: icrcAccount(env.alice.getPrincipal()),
      amount,
    }),
  );
}

async function wallet(env: Spi103E2E, account: Uint8Array): Promise<unknown> {
  return env.runtime.callAs(env.icrcWallet.actor, env.alice, (actor) =>
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
