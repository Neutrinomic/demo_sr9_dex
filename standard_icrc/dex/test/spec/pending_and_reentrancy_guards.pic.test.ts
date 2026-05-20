import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("pending operations and recovery guards", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("ledger rejection during withdraw and forced return restores local accounting", async () => {
    s = await createDexScenario({ name: "pending-recovery", ledgerCount: 1, userCount: 2 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 100_000n));

    await s.runtime.stopCanister(s.ledgers[0].canisterId);
    expectErr(await s.withdraw(0, 0, 30_000n, { checkExternal: false }), "ledgerTransferRejected");
    await s.runtime.startCanister(s.ledgers[0].canisterId);
    await s.assertAll();

    expectOk(await s.retireLedger(0));
    await s.runtime.stopCanister(s.ledgers[0].canisterId);
    expectErr(await s.returnLedgerBalances(0, s.controller, { checkExternal: false }), "ledgerTransferRejected");
    await s.runtime.startCanister(s.ledgers[0].canisterId);
    await s.assertAll();
    expectOk(await s.returnLedgerBalances(0));
  });

  test("concurrent withdraw attempts settle to one spendable debit at most", async () => {
    s = await createDexScenario({ name: "pending-concurrent-withdraw", ledgerCount: 1, userCount: 1 });
    await s.whitelistAll();
    expectOk(await s.approveAndDeposit(0, 0, 100_000n));

    s.runtime.as(s.dex.actor, s.users[0]);
    const withdraw = {
      subject: s.users[0].getPrincipal(),
      ledger: s.ledgers[0].canisterId,
      to: s.runtime.account(s.users[0]),
      amount: 60_000n,
    };
    const results = await Promise.all([
      s.dex.actor.spi_101_withdraw(withdraw),
      s.dex.actor.spi_101_withdraw(withdraw),
    ]);
    const ok = results.filter((result) => "ok" in result);
    expect(ok.length).toBeLessThanOrEqual(1);
    for (const result of ok as Array<{ ok: { debitAmount: bigint } }>) {
      s.model.debit(s.users[0].getPrincipal(), s.ledgers[0].key, result.ok.debitAmount);
    }
    await s.assertAll();
  });
});
