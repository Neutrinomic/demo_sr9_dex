import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, stopPocketIcServer } from "../common/runtime.ts";
import {
  applySwapReceiptToModel,
  createDexScenario,
  expectErr,
  expectOk,
  hasVariant,
  type DexScenario,
  type SwapReceiptLike,
} from "./support/dexScenario.ts";

describe("swap theft guards", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("callers cannot swap balances they do not own or drain reserves", async () => {
    s = await createDexScenario({ name: "swap-theft", ledgerCount: 3, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));

    expectErr(await s.swap(1, 0, 1, 100_000n), "insufficientLocalBalance");
    expectOk(await s.approveAndDeposit(1, 0, 20_000n));
    expectErr(await s.swap(1, 0, 1, 20_001n), "insufficientLocalBalance");
    expectErr(await s.swap(1, 0, 2, 1_000n), "poolNotFound");
    expectErr(await s.swap(1, 0, 1, 1n), "insufficientLiquidity");
    await s.assertAll();
  });

  test("output credits go only to the swap caller", async () => {
    s = await createDexScenario({ name: "swap-output-owner", ledgerCount: 2, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));
    expectOk(await s.approveAndDeposit(1, 0, 100_000n));

    const beforeOther = await s.dex.actor.balances(s.users[2].getPrincipal());
    const receipt = expectOk<any>(await s.swap(1, 0, 1, 50_000n));
    expect(receipt.amountOut).toBeGreaterThan(0n);
    expect(await s.dex.actor.balances(s.users[2].getPrincipal())).toEqual(beforeOther);
    await s.assertAll();
  });

  test("overlapping swaps cannot both spend the same local input balance", async () => {
    s = await createDexScenario({ name: "swap-concurrent-spend", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 3_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 3_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));
    expectOk(await s.approveAndDeposit(1, 0, 100_000n));

    s.runtime.as(s.dex.actor, s.users[1]);
    const [first, second] = await Promise.all([
      s.dex.actor.swap(s.ledgers[0].canisterId, s.ledgers[1].canisterId, 80_000n, 0n),
      s.dex.actor.swap(s.ledgers[0].canisterId, s.ledgers[1].canisterId, 80_000n, 0n),
    ]);
    const results = [first, second];
    const oks = results.filter((result) => hasVariant(result, "ok")) as Array<{ ok: SwapReceiptLike }>;
    const errs = results.filter((result) => hasVariant(result, "err"));
    expect(oks).toHaveLength(1);
    expect(errs).toHaveLength(1);
    for (const result of oks) {
      applySwapReceiptToModel(s, s.users[1], result.ok);
    }
    expect(s.model.balance(s.users[1].getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBe(20_000n);
    await s.assertAll();
  });
});
