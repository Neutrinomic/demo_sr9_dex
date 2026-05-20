import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  accountFromText,
  accountToText,
  stopPocketIcServer,
  subaccountFromId,
  subaccountToText,
} from "../../../../shared/common/runtime.ts";
import {
  allowance,
  approve,
  balanceOf,
  deployIcrcLedger,
  expectBalance,
  mint,
  totalSupply,
  transfer,
} from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import { type DexE2E, setupDexE2E } from "./dexTestEnv.ts";

describe("dex e2e harness", () => {
  let env: DexE2E;

  beforeEach(async () => {
    env = await setupDexE2E();
  });

  afterEach(async () => {
    await env.runtime.tearDown();
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("runtime helpers control callers, time, and block production", async () => {
    const before = await env.runtime.time.nowMs();

    await env.runtime.callAs(env.dex.actor, env.alice, async (dex) => {
      expect(await dex.spi_101_balance({
        subject: env.alice.getPrincipal(),
      })).toEqual({ subject: env.alice.getPrincipal(), entries: [] });
    });
    await env.runtime.advanceSeconds(3, { ticks: 2 });
    await env.runtime.block(1);
    await env.runtime.withStoppedCanister(env.ledgerA.canisterId, async () => {
      await env.runtime.passTime(1);
    });

    expect(await env.runtime.time.nowMs()).toBeGreaterThanOrEqual(before + 3_000);
    expect(await env.ledgerA.actor.icrc1_fee()).toBe(env.ledgerA.fee);
  });

  test("ICRC account helpers normalize owners, subaccounts, and text", () => {
    const aliceSub = env.runtime.subaccount(42n);
    const aliceAccount = env.runtime.account("alice", aliceSub);
    const text = accountToText(aliceAccount);

    expect(aliceSub).toHaveLength(32);
    expect(aliceSub).toEqual(subaccountFromId(42n));
    expect(subaccountToText(aliceSub)).toBe(
      "000000000000000000000000000000000000000000000000000000000000002a",
    );
    expect(text).toBe(
      `${env.alice.getPrincipal().toText()}:${env.runtime.subaccountText(aliceSub)}`,
    );
    expect(accountToText(accountFromText(text))).toBe(text);
    expect(env.runtime.accountText(aliceAccount)).toBe(text);
    expect(env.runtime.account(env.bob).subaccount).toEqual([]);
    expect(env.runtime.account(env.bob).owner.toText()).toBe(
      env.bob.getPrincipal().toText(),
    );
  });

  test("ledger harness mints, transfers, approves, and checks balances", async () => {
    const aliceSub = env.runtime.subaccount(7n);
    const aliceSubAccount = env.runtime.account("alice", aliceSub);
    const beforeSupply = await totalSupply(env.ledgerA);

    await mint(env.ledgerA, aliceSubAccount, 123_000n, {
      minter: env.controller,
    });
    expect(await totalSupply(env.ledgerA)).toBe(beforeSupply + 123_000n);
    await expectBalance(env.ledgerA, aliceSubAccount, 123_000n);

    await transfer(env.ledgerA, env.alice, env.bob, 100_000n, {
      fromSubaccount: aliceSub,
    });
    await expectBalance(
      env.ledgerA,
      aliceSubAccount,
      123_000n - 100_000n - env.ledgerA.fee,
    );
    expect(await balanceOf(env.ledgerA, env.bob)).toBe(10_000_100_000n);

    await approve(env.ledgerA, env.bob, env.dex.canisterId, 50_000n);
    expect(
      (await allowance(env.ledgerA, env.bob, env.dex.canisterId)).allowance,
    ).toBe(50_000n);

    const minterSub = env.runtime.subaccount(99n);
    const customMinterLedger = await deployIcrcLedger(env.pic, {
      controller: env.controller,
      symbol: "MIN",
      mintingAccount: env.runtime.account("controller", minterSub),
    });
    await mint(customMinterLedger, env.alice, 55_000n, {
      minter: env.controller,
    });
    await expectBalance(customMinterLedger, env.alice, 55_000n);
  });
});
