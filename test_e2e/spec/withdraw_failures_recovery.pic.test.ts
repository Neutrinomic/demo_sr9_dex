import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("withdraw failures and recovery", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("withdraw guards balance, fee headroom, and restores debits after ledger rejection", async () => {
    s = await createDexScenario({ name: "withdraw-failures", ledgerCount: 1, userCount: 2 });
    await s.whitelistAll();

    expectErr(await s.withdraw(0, 0, 1n), "insufficientLocalBalance");
    expectOk(await s.approveAndDeposit(0, 0, 50_000n));
    expectErr(await s.withdraw(0, 0, 0n), "zeroAmount");
    expectErr(await s.withdraw(0, 0, 45_001n), "insufficientLocalBalance");

    await s.runtime.stopCanister(s.ledgers[0].canisterId);
    expectErr(await s.withdraw(0, 0, 30_000n, { checkExternal: false }), "ledgerTransferRejected");
    await s.runtime.startCanister(s.ledgers[0].canisterId);
    await s.assertAll();

    expectOk(await s.withdraw(0, 0, 40_000n));
    await s.assertAll();
  });

  test("exact amount plus cached fee can empty a local ledger balance", async () => {
    s = await createDexScenario({ name: "withdraw-exact-fee", ledgerCount: 1, userCount: 1 });
    await s.whitelistAll();

    expectOk(await s.approveAndDeposit(0, 0, 75_000n));
    expectOk(await s.withdraw(0, 0, 65_000n));
    expect(await s.dex.actor.balances(s.users[0].getPrincipal())).toEqual([]);
    await s.assertAll();
  });
});
