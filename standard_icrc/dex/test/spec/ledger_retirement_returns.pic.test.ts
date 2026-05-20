import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("ledger retirement balance returns", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("controller can return non-dust local balances before removing a retiring ledger", async () => {
    s = await createDexScenario({ name: "retirement-returns", ledgerCount: 1, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 50_000n));
    expectOk(await s.approveAndDeposit(1, 0, 80_000n));

    expectOk(await s.retireLedger(0));
    expectErr(await s.deposit(2, 0, 10_000n), "ledgerNotSupported");

    const first = expectOk<any>(await s.returnLedgerBalances(0));
    expect(first.returnedUsers).toBe(1n);
    const second = expectOk<any>(await s.returnLedgerBalances(0));
    expect(second.returnedUsers).toBe(1n);
    const none = expectOk<any>(await s.returnLedgerBalances(0));
    expect(none.returnedUsers).toBe(0n);

    expectOk(await s.removeLedger(0));
  });

  test("forced returns are controller-only and blocked while pools still use the ledger", async () => {
    s = await createDexScenario({ name: "retirement-return-guards", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 100_000n));
    expectOk(await s.approveAndDeposit(0, 1, 100_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 50_000n, 50_000n));
    expectOk(await s.retireLedger(0));

    expectErr(await s.returnLedgerBalances(0, s.users[1]), "notController");
    expectErr(await s.returnLedgerBalances(0), "ledgerHasPools");
    expectOk(await s.removePool(0, 1));
    expectOk(await s.returnLedgerBalances(0));
    await s.assertAll();
  });
});
