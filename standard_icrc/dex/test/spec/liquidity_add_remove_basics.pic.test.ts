import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { poolKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("liquidity add and remove basics", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("initial and proportional liquidity mint shares, leftovers, and removable LP balances", async () => {
    s = await createDexScenario({ name: "liquidity-basics", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));

    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 3_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 3_000_000n));
    }

    const first = expectOk<any>(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n)).added;
    expect(first.shares).toBe(999_999n);
    expect(first.lockedShares).toBe(1n);

    const second = expectOk<any>(await s.addLiquidity(1, 0, 1, 200_000n, 300_000n)).added;
    expect(second.usedA).toBe(200_000n);
    expect(second.usedB).toBe(200_000n);
    expect(second.leftoverB).toBe(100_000n);

    const key = poolKey(s.ledgers[0].canisterId, s.ledgers[1].canisterId);
    const shares = s.model.balance(s.users[1].getPrincipal(), key);
    const removed = expectOk<any>(await s.removeLiquidity(1, 0, 1, shares / 2n)).removed;
    expect(removed.amountA).toBeGreaterThan(0n);
    expect(removed.amountB).toBeGreaterThan(0n);
    await s.assertAll();
  });

  test("removing all user-owned shares leaves locked liquidity in the pool", async () => {
    s = await createDexScenario({ name: "liquidity-locked-left", ledgerCount: 2, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    const added = expectOk<any>(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n)).added;

    expectOk(await s.removeLiquidity(0, 0, 1, added.shares));
    const pool = s.model.pools.get(poolKey(s.ledgers[0].canisterId, s.ledgers[1].canisterId));
    expect(pool?.lockedShares).toBe(1n);
    expect(pool?.totalShares).toBe(1n);
    expect(pool?.reserveA).toBeGreaterThan(0n);
    expect(pool?.reserveB).toBeGreaterThan(0n);
    await s.assertAll();
  });
});
