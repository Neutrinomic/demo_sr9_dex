import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, poolKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("roundtrip attack sequences", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("add, remove, and swap loops do not let an attacker end with more starting tokens", async () => {
    s = await createDexScenario({ name: "roundtrip-attacks", ledgerCount: 2, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 5_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 5_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 2_000_000n, 2_000_000n));

    const attacker = s.users[1].getPrincipal();
    const keyA = ledgerKey(s.ledgers[0].canisterId);
    const keyB = ledgerKey(s.ledgers[1].canisterId);
    const beforeA = s.model.balance(attacker, keyA);
    const beforeB = s.model.balance(attacker, keyB);

    const firstSwap = expectOk<any>(await s.swap(1, 0, 1, 250_000n));
    expectOk(await s.swap(1, 1, 0, firstSwap.amountOut));
    const added = expectOk<any>(await s.addLiquidity(1, 0, 1, 300_000n, 300_000n)).added;
    expectOk(await s.removeLiquidity(1, 0, 1, added.shares));

    expect(s.model.balance(attacker, keyA)).toBeLessThanOrEqual(beforeA);
    expect(s.model.balance(attacker, keyB)).toBeLessThanOrEqual(beforeB);
    expect(s.model.balance(attacker, poolKey(s.ledgers[0].canisterId, s.ledgers[1].canisterId))).toBe(0n);
    await s.assertAll();
  });

  test("repeated swap back-and-forth keeps both attacker token balances bounded", async () => {
    s = await createDexScenario({ name: "roundtrip-swaps-only", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 5_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 5_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 2_000_000n, 2_000_000n));

    const attacker = s.users[1].getPrincipal();
    const keyA = ledgerKey(s.ledgers[0].canisterId);
    const keyB = ledgerKey(s.ledgers[1].canisterId);
    const beforeA = s.model.balance(attacker, keyA);
    const beforeB = s.model.balance(attacker, keyB);
    for (let i = 0; i < 10; i += 1) {
      const out = expectOk<any>(await s.swap(1, 0, 1, 25_000n, 0n, { checkExternal: false })).amountOut;
      await s.swap(1, 1, 0, out, 0n, { checkExternal: false });
    }
    expect(s.model.balance(attacker, keyA)).toBeLessThanOrEqual(beforeA);
    expect(s.model.balance(attacker, keyB)).toBeLessThanOrEqual(beforeB);
    await s.assertAll();
  });
});
