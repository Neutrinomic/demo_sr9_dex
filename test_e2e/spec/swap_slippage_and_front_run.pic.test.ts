import { afterAll, afterEach, describe, test } from "bun:test";
import { stopPocketIcServer } from "../common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("swap slippage and front-run behavior", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("stale strict quotes fail after the pool moves, wider slippage succeeds", async () => {
    s = await createDexScenario({ name: "swap-slippage", ledgerCount: 2, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));

    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 3_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 3_000_000n));
    }
    expectOk(await s.addLiquidity(0, 0, 1, 1_500_000n, 1_500_000n));

    const staleQuote = expectOk<any>(await s.quote(0, 1, 250_000n, 0n));
    expectOk(await s.swap(1, 0, 1, 400_000n, 0n));
    expectErr(await s.swap(0, 0, 1, 250_000n, staleQuote.amountOut), "slippage");

    const freshQuote = expectOk<any>(await s.quote(0, 1, 250_000n, 0n));
    expectOk(await s.swap(0, 0, 1, 250_000n, freshQuote.amountOut));
  });

  test("zero amount and same-ledger swaps are rejected before touching balances", async () => {
    s = await createDexScenario({ name: "swap-input-guards", ledgerCount: 2, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 100_000n));
    expectOk(await s.approveAndDeposit(0, 1, 100_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 50_000n, 50_000n));

    expectErr(await s.swap(0, 0, 1, 0n), "zeroAmount");
    expectErr(await s.swap(0, 0, 0, 1n), "sameLedger");
    await s.assertAll();
  });

  test("a strict quote cannot be reused after the caller already moved the pool", async () => {
    s = await createDexScenario({ name: "swap-reused-quote", ledgerCount: 2, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 3_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 3_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));

    const quote = expectOk<any>(await s.quote(0, 1, 100_000n));
    expectOk(await s.swap(0, 0, 1, 100_000n, quote.amountOut));
    expectErr(await s.swap(0, 0, 1, 100_000n, quote.amountOut), "slippage");
    await s.assertAll();
  });
});
