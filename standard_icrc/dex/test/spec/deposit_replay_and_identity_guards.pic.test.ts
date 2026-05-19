import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { ledgerKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import { approve } from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  createDexScenario,
  expectErr,
  expectOk,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("deposit replay and caller identity guards", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("a one-use allowance cannot be replayed into a second local credit", async () => {
    s = await createDexScenario({ name: "deposit-replay", ledgerCount: 1, userCount: 1 });
    await s.whitelistAll();

    await approve(s.ledgers[0], s.users[0], s.dex.canisterId, 110_000n);
    expectOk(await s.deposit(0, 0, 100_000n));
    expectErr(await s.deposit(0, 0, 100_000n), "ledgerTransferFromErr");

    expect(s.model.balance(s.users[0].getPrincipal(), ledgerKey(s.ledgers[0].canisterId))).toBe(100_000n);
    await s.assertAll();
  });

  test("one user's approval cannot be used to credit a different caller", async () => {
    s = await createDexScenario({ name: "deposit-identity", ledgerCount: 1, userCount: 2 });
    await s.whitelistAll();

    await approve(s.ledgers[0], s.users[0], s.dex.canisterId, 110_000n);
    expectErr(await s.deposit(1, 0, 100_000n), "ledgerTransferFromErr");
    expect(await s.dex.actor.balances(s.users[1].getPrincipal())).toEqual([]);

    expectOk(await s.deposit(0, 0, 100_000n));
    await s.assertAll();
  });
});
