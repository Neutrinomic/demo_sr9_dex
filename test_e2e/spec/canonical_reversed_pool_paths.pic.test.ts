import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { poolKey, stopPocketIcServer } from "../common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("canonical pool paths with reversed ledgers", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("create, add, swap, and remove work correctly when users pass ledgers reversed", async () => {
    s = await createDexScenario({ name: "canonical-reversed", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();

    const pool = expectOk<any>(await s.createPool(1, 0));
    expect(pool.key).toBe(poolKey(s.ledgers[0].canisterId, s.ledgers[1].canisterId));
    expectErr(await s.createPool(0, 1), "poolAlreadyExists");

    for (const user of [0, 1]) {
      expectOk(await s.approveAndDeposit(user, 0, 2_000_000n));
      expectOk(await s.approveAndDeposit(user, 1, 2_000_000n));
    }

    const added = expectOk<any>(await s.addLiquidity(0, 1, 0, 700_000n, 500_000n)).added;
    expect(added.ledgerA.toText()).toBe(pool.ledgerA.toText());
    expect(added.ledgerB.toText()).toBe(pool.ledgerB.toText());
    expect(added.usedA + added.leftoverA).toBe(500_000n);
    expect(added.usedB + added.leftoverB).toBe(700_000n);

    const reverseQuote = expectOk<any>(await s.quote(1, 0, 50_000n));
    expectOk(await s.swap(1, 1, 0, 50_000n, reverseQuote.amountOut));
    expectOk(await s.removeLiquidity(0, 1, 0, added.shares / 2n));
    await s.assertAll();
  });
});
