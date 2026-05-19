import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ledgerKey, poolKey, stopPocketIcServer, unwrapOk } from "../common/runtime.ts";
import {
  approve,
  balanceOf,
} from "../fixtures/icrc_ledger/ledgerHarness.ts";
import {
  createDefaultPool,
  type DexE2E,
  setupDexE2E,
  whitelistLedgers,
} from "./dexTestEnv.ts";

describe("dex runtime behavior", () => {
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

  test("deploys the DEX and two real ICRC ledgers", async () => {
    expect(await env.dex.actor.balances(env.alice.getPrincipal())).toEqual([]);
    expect(await env.dex.actor.pools()).toEqual([]);
    expect(await env.ledgerA.actor.icrc1_fee()).toBe(env.ledgerA.fee);
    expect(await env.ledgerB.actor.icrc1_fee()).toBe(env.ledgerB.fee);
    expect(await balanceOf(env.ledgerA, env.alice)).toBe(10_000_000_000n);
  });

  test("controller can whitelist ledgers and create an empty pool", async () => {
    await whitelistLedgers(env);
    const pool = unwrapOk<any>(await createDefaultPool(env));

    expect(pool.key).toBe(poolKey(env.ledgerA.canisterId, env.ledgerB.canisterId));
    expect(pool.reserveA).toBe(0n);
    expect(pool.reserveB).toBe(0n);
    expect(pool.totalShares).toBe(0n);
    expect(await env.dex.actor.pools()).toHaveLength(1);
  });

  test("user approves the DEX and deposits through ICRC-2 transfer_from", async () => {
    await whitelistLedgers(env);
    await approve(
      env.ledgerA,
      env.alice,
      env.dex.canisterId,
      1_000_000n,
    );

    env.runtime.as(env.dex.actor, env.alice);
    const receipt = unwrapOk<any>(
      await env.dex.actor.deposit(env.ledgerA.canisterId, 500_000n),
    );
    const balances = await env.dex.actor.balances(env.alice.getPrincipal());

    expect(receipt.ledger.toText()).toBe(env.ledgerA.canisterId.toText());
    expect(receipt.amount).toBe(500_000n);
    expect(balances).toEqual([[ledgerKey(env.ledgerA.canisterId), 500_000n]]);
  });
});
