import { afterAll, afterEach, describe, test } from "bun:test";
import { stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("dust abandon", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("only dust-sized retiring ledger balances can be abandoned", async () => {
    s = await createDexScenario({ name: "dust-abandon", ledgerCount: 1, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 5_000n));
    expectOk(await s.approveAndDeposit(1, 0, 25_000n));
    expectOk(await s.retireLedger(0));

    expectErr(await s.abandonDust(1, 0), "balanceExceedsFee");
    expectOk(await s.returnLedgerBalances(0));
    expectErr(await s.returnLedgerBalances(0), "onlyDustBalances");
    expectOk(await s.abandonDust(0, 0));
    expectOk(await s.removeLedger(0));
  });

  test("dust abandon requires a retiring listed ledger and an existing local balance", async () => {
    s = await createDexScenario({ name: "dust-abandon-guards", ledgerCount: 2, userCount: 1 });

    expectErr(await s.abandonDust(0, 0), "ledgerNotWhitelisted");
    await s.whitelistAll();
    expectErr(await s.abandonDust(0, 0), "ledgerNotRetiring");
    expectOk(await s.retireLedger(0));
    expectErr(await s.abandonDust(0, 0), "noLocalBalance");

    expectOk(await s.approveAndDeposit(0, 1, 5_000n));
    expectOk(await s.retireLedger(1));
    expectOk(await s.abandonDust(0, 1));
    await s.assertAll();
  });

  test("a user cannot abandon another user's dust balance", async () => {
    s = await createDexScenario({ name: "dust-abandon-owner", ledgerCount: 1, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 5_000n));
    expectOk(await s.retireLedger(0));

    expectErr(await s.abandonDust(1, 0), "noLocalBalance");
    expectOk(await s.abandonDust(0, 0));
    await s.assertAll();
  });
});
