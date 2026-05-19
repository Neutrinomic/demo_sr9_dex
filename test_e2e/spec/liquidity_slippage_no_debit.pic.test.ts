import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, poolKey, stopPocketIcServer } from "../common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("liquidity slippage failures do not debit balances", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("failed add and remove slippage leaves token and LP balances unchanged", async () => {
    s = await createDexScenario({ name: "liquidity-slippage", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 2_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 2_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));

    const user = s.users[1].getPrincipal();
    const keyA = ledgerKey(s.ledgers[0].canisterId);
    const keyB = ledgerKey(s.ledgers[1].canisterId);
    const pool = poolKey(s.ledgers[0].canisterId, s.ledgers[1].canisterId);
    const beforeA = s.model.balance(user, keyA);
    const beforeB = s.model.balance(user, keyB);

    expectErr(await s.addLiquidity(1, 0, 1, 100_000n, 100_000n, 1_000_000n), "insufficientLiquidity");
    expect(s.model.balance(user, keyA)).toBe(beforeA);
    expect(s.model.balance(user, keyB)).toBe(beforeB);

    const added = expectOk<any>(await s.addLiquidity(1, 0, 1, 100_000n, 100_000n)).added;
    const lpBefore = s.model.balance(user, pool);
    expectErr(await s.removeLiquidity(1, 0, 1, added.shares, 1_000_000n, 1_000_000n), "slippage");
    expect(s.model.balance(user, pool)).toBe(lpBefore);
    await s.assertAll();
  });

  test("stale remove-liquidity minimums fail after swaps change the pool", async () => {
    s = await createDexScenario({ name: "liquidity-stale-remove", ledgerCount: 2, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1, 2]) {
      expectOk(await s.approveAndDeposit(user, 0, 2_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 2_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));
    const added = expectOk<any>(await s.addLiquidity(1, 0, 1, 500_000n, 500_000n)).added;
    const expected = expectOk<any>(await s.removeLiquidity(1, 0, 1, added.shares / 10n));
    const receivedA = expected.removed.amountA;
    const receivedB = expected.removed.amountB;

    const addedAgain = expectOk<any>(await s.addLiquidity(1, 0, 1, 100_000n, 100_000n)).added;
    expectOk(await s.swap(2, 0, 1, 500_000n));
    expectErr(
      await s.removeLiquidity(1, 0, 1, addedAgain.shares, receivedA * 10n, receivedB * 10n),
      "slippage",
    );
    await s.assertAll();
  });
});
