import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import { approve } from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("deposit failures", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("failed deposit paths never create local credit", async () => {
    s = await createDexScenario({ name: "deposit-failures", ledgerCount: 2, userCount: 2 });

    expectErr(await s.deposit(0, 0, 10_000n), "ledgerNotActive");
    expectOk(await s.whitelistLedger(0));
    expectErr(await s.deposit(0, 0, 0n), "zeroAmount");
    expectErr(await s.deposit(0, 0, 50_000n), "ledgerTransferFromErr");

    await approve(s.ledgers[0], s.users[0], s.dex.canisterId, 100_000n);
    await s.runtime.stopCanister(s.ledgers[0].canisterId);
    expectErr(await s.deposit(0, 0, 50_000n, { checkExternal: false }), "ledgerTransferFromRejected");
    await s.runtime.startCanister(s.ledgers[0].canisterId);

    expect(await s.dex.actor.balances(s.users[0].getPrincipal())).toEqual([]);
    await s.assertLedgerObligation(0);
  });

  test("approval without external funds still cannot mint local DEX balance", async () => {
    s = await createDexScenario({
      name: "deposit-insufficient-funds",
      ledgerCount: 1,
      userCount: 1,
      initialExternalBalance: 0n,
    });
    await s.whitelistAll();

    await s.fund(0, 0, s.ledgers[0].fee);
    await approve(s.ledgers[0], s.users[0], s.dex.canisterId, 1_000_000n);
    expectErr(await s.deposit(0, 0, 900_000n), "ledgerTransferFromErr");
    expect(await s.dex.actor.balances(s.users[0].getPrincipal())).toEqual([]);
    await s.assertLedgerObligation(0);
  });
});
