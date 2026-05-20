import { afterAll, afterEach, describe, test } from "bun:test";
import { stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("retired ledger LP exit behavior", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("retiring a ledger blocks new exposure but still lets users remove LP shares", async () => {
    s = await createDexScenario({ name: "retired-lp-exit", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    const added = expectOk<any>(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n)).added;

    expectOk(await s.retireLedger(0));
    expectErr(await s.deposit(1, 0, 100_000n), "ledgerNotSupported");
    expectErr(await s.swap(0, 0, 1, 10_000n), "ledgerNotActive");
    expectErr(await s.addLiquidity(0, 0, 1, 10_000n, 10_000n), "ledgerNotActive");

    expectOk(await s.removeLiquidity(0, 0, 1, added.shares / 2n));
    await s.assertAll();
  });

  test("retiring a ledger still allows ordinary user withdrawals from local balance", async () => {
    s = await createDexScenario({ name: "retired-withdraw", ledgerCount: 1, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 100_000n));
    expectOk(await s.retireLedger(0));

    expectOk(await s.withdraw(0, 0, 90_000n));
    await s.assertAll();
  });
});
