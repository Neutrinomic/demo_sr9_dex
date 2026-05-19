import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("ledger allowlist lifecycle", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("ledgers cannot be removed before pools and local balances are cleared", async () => {
    s = await createDexScenario({ name: "ledger-lifecycle", ledgerCount: 3, userCount: 2 });

    expectOk(await s.whitelistLedger(0));
    expectErr(await s.whitelistLedger(0), "ledgerAlreadyActive");
    expectErr(await s.createPool(0, 1), "ledgerNotActive");
    expectOk(await s.whitelistLedger(1));
    expectOk(await s.createPool(0, 1));

    expectOk(await s.retireLedger(0));
    expectErr(await s.removeLedger(0), "ledgerHasPools");
    expectOk(await s.removePool(0, 1));
    expectOk(await s.removeLedger(0));

    expectOk(await s.whitelistLedger(2));
    expectOk(await s.approveAndDeposit(0, 2, 100_000n));
    expectOk(await s.retireLedger(2));
    expectErr(await s.removeLedger(2), "ledgerHasLocalBalances");
    expectOk(await s.withdraw(0, 2, 90_000n));
    expectOk(await s.removeLedger(2));
  });

  test("same-ledger pools and active-ledger final removal are rejected", async () => {
    s = await createDexScenario({ name: "ledger-lifecycle-guards", ledgerCount: 2, userCount: 1 });

    expectErr(await s.removeLedger(0), "ledgerNotWhitelisted");
    expectOk(await s.whitelistLedger(0));
    expectOk(await s.whitelistLedger(1));
    expectErr(await s.removeLedger(0), "ledgerNotRetiring");
    expectErr(await s.createPool(0, 0), "sameLedger");
    expectOk(await s.createPool(0, 1));
    expectErr(await s.createPool(1, 0), "poolAlreadyExists");
    await s.assertAll();
  });

  test("a fully removed ledger can be re-added without reviving old balances", async () => {
    s = await createDexScenario({ name: "ledger-readd-clean", ledgerCount: 1, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 50_000n));
    expectOk(await s.retireLedger(0));
    expectOk(await s.withdraw(0, 0, 40_000n));
    expectOk(await s.removeLedger(0));

    expectOk(await s.whitelistLedger(0));
    expect(await s.dex.actor.balances(s.users[0].getPrincipal())).toEqual([]);
    expectOk(await s.approveAndDeposit(0, 0, 30_000n));
    await s.assertAll();
  });
});
