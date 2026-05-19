import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, poolKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("balance and pool views", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("clients can discover positive real-token balances, LP positions, and canonical pools", async () => {
    s = await createDexScenario({ name: "views", ledgerCount: 4, userCount: 4 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.createPool(2, 1));
    expectOk(await s.createPool(3, 0));

    for (const [a, b, user] of [[0, 1, 0], [2, 1, 1], [3, 0, 2]] as const) {
      expectOk(await s.approveAndDeposit(user, a, 1_000_000n));
      expectOk(await s.approveAndDeposit(user, b, 1_000_000n));
      expectOk(await s.addLiquidity(user, a, b, 500_000n, 500_000n));
    }

    const user0 = await s.dex.actor.balances(s.users[0].getPrincipal());
    expect(user0.map((entry: [string, bigint]) => entry[0])).toContain(ledgerKey(s.ledgers[0].canisterId));
    expect(user0.map((entry: [string, bigint]) => entry[0])).toContain(poolKey(s.ledgers[0].canisterId, s.ledgers[1].canisterId));
    const pools = await s.dex.actor.pools();
    expect(pools).toHaveLength(3);
    for (const pool of pools) {
      expect(pool.key).toBe(poolKey(pool.ledgerA, pool.ledgerB));
    }
    await s.assertAll();
  });

  test("balances view drops entries after a local balance is fully consumed", async () => {
    s = await createDexScenario({ name: "views-zero-balance", ledgerCount: 1, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 50_000n));
    expect(await s.dex.actor.balances(s.users[0].getPrincipal())).toHaveLength(1);

    expectOk(await s.withdraw(0, 0, 40_000n));
    expect(await s.dex.actor.balances(s.users[0].getPrincipal())).toEqual([]);
    await s.assertAll();
  });
});
