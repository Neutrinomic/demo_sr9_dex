import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, stopPocketIcServer, variantKey } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectOk,
  hasVariant,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("concurrent withdraw double-spend attempts", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("two overlapping withdraws cannot both spend the same local balance", async () => {
    s = await createDexScenario({ name: "concurrent-withdraw", ledgerCount: 1, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 100_000n));

    s.runtime.as(s.dex.actor, s.users[0]);
    const withdraw = {
      subject: s.users[0].getPrincipal(),
      ledger: s.ledgers[0].canisterId,
      to: s.runtime.account(s.users[0]),
      amount: 60_000n,
    };
    const [first, second] = await Promise.all([
      s.dex.actor.spi_101_withdraw(withdraw),
      s.dex.actor.spi_101_withdraw(withdraw),
    ]);

    const results = [first, second];
    const oks = results.filter((result) => hasVariant(result, "ok"));
    const errs = results.filter((result) => hasVariant(result, "err"));
    expect(oks).toHaveLength(1);
    expect(errs).toHaveLength(1);
    expect(["withdrawInProgress", "insufficientLocalBalance"]).toContain(
      variantKey((errs[0] as { err: unknown }).err),
    );

    const receipt = (oks[0] as { ok: { debitAmount: bigint } }).ok;
    s.model.debit(s.users[0].getPrincipal(), ledgerKey(s.ledgers[0].canisterId), receipt.debitAmount);
    await s.assertAll();
  });
});
