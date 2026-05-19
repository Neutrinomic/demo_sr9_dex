import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, poolKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("pool lifecycle removal", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("controller pool removal converts LP shares back to local token balances", async () => {
    s = await createDexScenario({ name: "pool-removal", ledgerCount: 2, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 2_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 2_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));
    expectOk(await s.addLiquidity(1, 0, 1, 500_000n, 500_000n));

    const key = poolKey(s.ledgers[0].canisterId, s.ledgers[1].canisterId);
    expectOk(await s.removePool(0, 1, s.controller, { checkAll: true }));
    expect(s.model.pools.has(key)).toBe(false);
    expect(s.model.balance(s.users[0].getPrincipal(), key)).toBe(0n);
    expect(s.model.balance(s.users[1].getPrincipal(), key)).toBe(0n);
    expect(s.model.balance(s.controller.getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBeGreaterThan(0n);
    expectErr(await s.swap(0, 0, 1, 1n), "poolNotFound");
  });

  test("empty pools can be removed by reversed ledger arguments", async () => {
    s = await createDexScenario({ name: "pool-empty-reversed-removal", ledgerCount: 2, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));

    const receipt = expectOk<any>(await s.removePool(1, 0));
    expect(receipt.returnedA).toBe(0n);
    expect(receipt.returnedB).toBe(0n);
    expect(receipt.settledUsers).toBe(0n);
    expectErr(await s.removePool(0, 1), "poolNotFound");
    await s.assertAll();
  });

  test("pool removal settles current post-swap reserves for every LP holder", async () => {
    s = await createDexScenario({ name: "pool-removal-after-swaps", ledgerCount: 2, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1, 2]) {
      expectOk(await s.approveAndDeposit(user, 0, 3_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 3_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));
    expectOk(await s.addLiquidity(1, 0, 1, 500_000n, 500_000n));
    expectOk(await s.swap(2, 0, 1, 250_000n));
    expectOk(await s.swap(2, 1, 0, 100_000n));

    const receipt = expectOk<any>(await s.removePool(0, 1, s.controller, { checkAll: true }));
    expect(receipt.settledUsers).toBe(2n);
    expect(receipt.burnedUserShares).toBeGreaterThan(0n);
    expect(receipt.burnedLockedShares).toBe(1n);
  });
});
