import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, poolKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectOk,
  splitFees,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("swap fee distribution", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("0.3 percent fee splits 20 percent to controller and 80 percent into LP value", async () => {
    s = await createDexScenario({ name: "fee-distribution", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    expectOk(await s.approveAndDeposit(1, 0, 500_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));

    const fees = splitFees(250_000n);
    const receipt = expectOk<any>(await s.swap(1, 0, 1, 250_000n, 0n));
    expect(receipt.fee).toBe(fees.fee);
    expect(receipt.platformFee).toBe(fees.platformFee);
    expect(receipt.lpFee).toBe(fees.lpFee);
    expect(s.model.balance(s.controller.getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBe(fees.platformFee);
    const key = poolKey(s.ledgers[0].canisterId, s.ledgers[1].canisterId);
    expect(s.model.pools.get(key)?.reserveA).toBe(1_000_000n + fees.effectiveAmountIn + fees.lpFee);
  });

  test("fees accumulate independently for both swap directions", async () => {
    s = await createDexScenario({ name: "fee-distribution-both-ways", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 3_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 3_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 1_500_000n, 1_500_000n));

    const firstFees = splitFees(300_000n);
    const first = expectOk<any>(await s.swap(1, 0, 1, 300_000n));
    const secondFees = splitFees(first.amountOut / 2n);
    expectOk(await s.swap(1, 1, 0, first.amountOut / 2n));

    expect(s.model.balance(s.controller.getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBe(firstFees.platformFee);
    expect(s.model.balance(s.controller.getPrincipal(), ledgerKey(s.ledgers[1].canisterId))).toBe(secondFees.platformFee);
    await s.assertAll();
  });
});
