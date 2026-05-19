import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("tiny amount rounding attack attempts", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("many tiny swaps cannot manufacture value through zero-fee rounding", async () => {
    s = await createDexScenario({ name: "tiny-rounding", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 2_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 2_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));

    const attacker = s.users[1].getPrincipal();
    const keyA = ledgerKey(s.ledgers[0].canisterId);
    const keyB = ledgerKey(s.ledgers[1].canisterId);
    const beforeA = s.model.balance(attacker, keyA);
    const beforeB = s.model.balance(attacker, keyB);

    for (let i = 0; i < 100; i += 1) {
      await s.swap(1, 0, 1, 2n, 0n, { checkExternal: false });
      await s.swap(1, 1, 0, 1n, 0n, { checkExternal: false });
    }

    expect(s.model.balance(attacker, keyA)).toBeLessThanOrEqual(beforeA);
    expect(s.model.balance(attacker, keyB)).toBeLessThanOrEqual(beforeB);
    await s.assertAll();
  });

  test("amounts whose quote rounds to zero fail without debiting input", async () => {
    s = await createDexScenario({ name: "tiny-rounding-zero-out", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    expectOk(await s.approveAndDeposit(1, 0, 10_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));

    const before = s.model.balance(s.users[1].getPrincipal(), ledgerKey(s.ledgers[0].canisterId));
    expectErr(await s.swap(1, 0, 1, 1n, 0n), "insufficientLiquidity");
    expect(s.model.balance(s.users[1].getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBe(before);
    await s.assertAll();
  });
});
