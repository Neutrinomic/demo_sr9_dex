import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../common/runtime.ts";
import {
  applyAddReceiptToModel,
  createDexScenario,
  expectErr,
  expectOk,
  hasVariant,
  type AddReceiptLike,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("liquidity theft guards", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("users cannot mint or burn LP shares without owning the required balances", async () => {
    s = await createDexScenario({ name: "liquidity-theft", ledgerCount: 2, userCount: 3 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));

    expectErr(await s.addLiquidity(1, 0, 1, 100_000n, 100_000n), "insufficientLocalBalance");
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));

    expectErr(await s.removeLiquidity(1, 0, 1, 1n), "insufficientLocalBalance");
    expectErr(await s.removeLiquidity(0, 0, 1, 1_000_000n), "insufficientLiquidity");

    expectOk(await s.retireLedger(0));
    expectErr(await s.addLiquidity(0, 0, 1, 10_000n, 10_000n), "ledgerNotActive");
    await s.assertAll();
  });

  test("same-ledger and missing-pool liquidity requests fail without balance movement", async () => {
    s = await createDexScenario({ name: "liquidity-request-guards", ledgerCount: 3, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 500_000n));
    expectOk(await s.approveAndDeposit(0, 1, 500_000n));

    expectErr(await s.addLiquidity(0, 0, 0, 10_000n, 10_000n), "sameLedger");
    expectErr(await s.addLiquidity(0, 0, 1, 10_000n, 10_000n), "poolNotFound");
    expectErr(await s.removeLiquidity(0, 0, 0, 1n), "sameLedger");
    expectErr(await s.removeLiquidity(0, 0, 1, 1n), "poolNotFound");
    await s.assertAll();
  });

  test("overlapping liquidity adds cannot both spend the same deposited tokens", async () => {
    s = await createDexScenario({ name: "liquidity-concurrent-add", ledgerCount: 2, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.createPool(0, 1));
    expectOk(await s.approveAndDeposit(0, 0, 2_000_000n));
    expectOk(await s.approveAndDeposit(0, 1, 2_000_000n));
    expectOk(await s.addLiquidity(0, 0, 1, 1_000_000n, 1_000_000n));
    expectOk(await s.approveAndDeposit(1, 0, 100_000n));
    expectOk(await s.approveAndDeposit(1, 1, 100_000n));

    s.runtime.as(s.dex.actor, s.users[1]);
    const request = {
      add: {
        ledgerA: s.ledgers[0].canisterId,
        ledgerB: s.ledgers[1].canisterId,
        maxAmountA: 80_000n,
        maxAmountB: 80_000n,
        minShares: 0n,
      },
    };
    const [first, second] = await Promise.all([
      s.dex.actor.liquidity(request),
      s.dex.actor.liquidity(request),
    ]);
    const results = [first, second];
    const oks = results.filter((result) => hasVariant(result, "ok")) as Array<{ ok: { added: AddReceiptLike } }>;
    const errs = results.filter((result) => hasVariant(result, "err"));
    expect(oks).toHaveLength(1);
    expect(errs).toHaveLength(1);
    applyAddReceiptToModel(s, s.users[1], oks[0].ok.added);
    await s.assertAll();
  });
});
