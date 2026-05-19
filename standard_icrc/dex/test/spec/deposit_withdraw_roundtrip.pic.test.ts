import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import { balanceOf } from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  createDexScenario,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("deposit and withdraw round trips", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("approved deposits become local balances and withdrawals burn one ledger fee", async () => {
    s = await createDexScenario({ name: "deposit-withdraw", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();

    const aliceBefore = await balanceOf(s.ledgers[0], s.users[0]);
    expectOk(await s.approveAndDeposit(0, 0, 1_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 500_000n));
    expectOk(await s.withdraw(0, 0, 200_000n));
    expectOk(await s.withdraw(0, 1, 100_000n));

    expect(s.model.balance(s.users[0].getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBe(790_000n);
    expect(s.model.balance(s.users[0].getPrincipal(), ledgerKey(s.ledgers[1].canisterId))).toBe(390_000n);
    expect(await balanceOf(s.ledgers[0], s.users[0])).toBe(aliceBefore - 1_000_000n - 20_000n + 200_000n);
    await s.assertAll();
  });

  test("two users can deposit and withdraw independently on the same ledger", async () => {
    s = await createDexScenario({ name: "deposit-withdraw-users", ledgerCount: 1, userCount: 2 });
    await s.whitelistAll();

    expectOk(await s.approveAndDeposit(0, 0, 250_000n));
    expectOk(await s.approveAndDeposit(1, 0, 400_000n));
    expectOk(await s.withdraw(0, 0, 100_000n));
    expectOk(await s.withdraw(1, 0, 390_000n));

    expect(s.model.balance(s.users[0].getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBe(140_000n);
    expect(s.model.balance(s.users[1].getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBe(0n);
    await s.assertAll();
  });
});
