import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  splitFees,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("platform fee custody", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("platform fees accrue only to the controller local balance and cannot be withdrawn by users", async () => {
    s = await createDexScenario({ name: "platform-fee-custody", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 50_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 50_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 30_000_000n, 30_000_000n));

    const amountIn = 20_000_000n;
    const fees = splitFees(amountIn);
    expectOk(await s.swap(1, 0, 1, amountIn));

    const key = ledgerKey(s.ledgers[0].canisterId);
    expect(s.model.balance(s.controller.getPrincipal(), key)).toBe(fees.platformFee);
    expect(s.model.balance(s.users[1].getPrincipal(), key)).toBe(50_000_000n - amountIn);
    expectErr(await s.withdraw(1, 0, 30_000_001n), "insufficientLocalBalance");

    expectOk(await s.withdraw(s.controller, 0, fees.platformFee - s.ledgers[0].fee));
    expect(s.model.balance(s.controller.getPrincipal(), key)).toBe(0n);
    await s.assertAll();
  });

  test("controller platform fees block final ledger removal until withdrawn", async () => {
    s = await createDexScenario({ name: "platform-fee-removal-block", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 50_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 50_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 30_000_000n, 30_000_000n));
    const fees = splitFees(20_000_000n);
    expectOk(await s.swap(1, 0, 1, 20_000_000n));

    expectOk(await s.retireLedger(0));
    expectOk(await s.retireLedger(1));
    expectOk(await s.removePool(0, 1));
    expectErr(await s.removeLedger(0), "ledgerHasLocalBalances");

    expectOk(await s.withdraw(s.controller, 0, fees.platformFee - s.ledgers[0].fee));
    expectErr(await s.removeLedger(0), "ledgerHasLocalBalances");
    await s.assertAll();
  });
});
