import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("admin access control", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("only the controller can mutate ledgers and pools", async () => {
    s = await createDexScenario({ name: "admin-access", ledgerCount: 3, userCount: 2 });

    expectErr(await s.whitelistLedger(0, s.users[0]), "notController");
    expectOk(await s.whitelistLedger(0));
    expectOk(await s.whitelistLedger(1));

    expectErr(await s.createPool(0, 1, s.users[0]), "notController");
    const pool = expectOk<any>(await s.createPool(0, 1));
    expect(pool.reserveA).toBe(0n);
    expect(pool.reserveB).toBe(0n);

    expectErr(await s.retireLedger(2, s.users[0]), "notController");
    expectErr(await s.removeLedger(2, s.users[0]), "notController");
    expectErr(await s.removePool(0, 1, s.users[0]), "notController");

    expectOk(await s.removePool(0, 1));
    await s.assertPools();
  });

  test("controller checks still apply after there is liquidity at risk", async () => {
    s = await createDexScenario({ name: "admin-access-funded", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 1_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 1_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 500_000n, 500_000n));

    expectErr(await s.removePool(0, 1, s.users[1]), "notController");
    expectErr(await s.retireLedger(0, s.users[1]), "notController");
    expectErr(await s.removeLedger(0, s.users[1]), "notController");
    await s.assertAll();
  });
});
