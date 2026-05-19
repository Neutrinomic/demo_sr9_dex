import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  quoteExactIn,
  splitFees,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("quote and swap basics", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("quote uses the same exact-in formula that swap settles", async () => {
    s = await createDexScenario({ name: "quote-swap", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectErr(await s.quote(0, 0, 100n), "sameLedger");
    expectErr(await s.quote(0, 1, 100n), "poolNotFound");

    expectOk(await s.createPool(0, 1));
    expectErr(await s.quote(0, 1, 100n), "insufficientLiquidity");
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));

    const fees = splitFees(100_000n);
    const expectedOut = quoteExactIn(1_000_000n, 1_000_000n, fees.effectiveAmountIn);
    const quote = expectOk<any>(await s.quote(0, 1, 100_000n, expectedOut));
    expect(quote.amountOut).toBe(expectedOut);
    const swap = expectOk<any>(await s.swap(0, 0, 1, 100_000n, quote.amountOut));
    expect(swap.amountOut).toBe(quote.amountOut);
    expect(swap.reserveInBefore).toBe(quote.reserveIn);
    expect(swap.reserveOutBefore).toBe(quote.reserveOut);
  });

  test("quote can report below-min output without mutating balances or pools", async () => {
    s = await createDexScenario({ name: "quote-below-min", ledgerCount: 2, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 1_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 1_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 500_000n, 500_000n));

    const quote = expectOk<any>(await s.quote(0, 1, 10_000n, 500_000n));
    expect(quote.ok).toBe(false);
    expect(quote.amountOut).toBeLessThan(500_000n);
    await s.assertAll();
  });

  test("retired input or output ledgers reject quotes and swaps", async () => {
    s = await createDexScenario({ name: "quote-swap-retired-ledger", ledgerCount: 2, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 1_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 1_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 500_000n, 500_000n));
    expectOk(await s.retireLedger(1));

    expectErr(await s.quote(0, 1, 10_000n), "ledgerNotActive");
    expectErr(await s.quote(1, 0, 10_000n), "ledgerNotActive");
    expectErr(await s.swap(0, 0, 1, 10_000n), "ledgerNotActive");
    expectErr(await s.swap(0, 1, 0, 10_000n), "ledgerNotActive");
    await s.assertAll();
  });
});
