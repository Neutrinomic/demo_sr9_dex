import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer } from "../common/runtime.ts";
import {
  createDexScenario,
  hasVariant,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("standard ledger time and duplicate edge cases", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("ledger-level duplicate and created-in-future errors do not affect DEX local balances", async () => {
    s = await createDexScenario({ name: "time-duplicate", ledgerCount: 1, userCount: 1 });
    await s.whitelistAll();
    const now = await s.runtime.time.nowNanos();
    const approveArgs = {
      spender: { owner: s.dex.canisterId, subaccount: [] },
      amount: 100_000n,
      fee: [],
      memo: [[1, 2, 3]],
      from_subaccount: [],
      created_at_time: [now],
      expected_allowance: [],
      expires_at: [],
    };

    s.runtime.as(s.ledgers[0].actor, s.users[0]);
    const first = await s.ledgers[0].actor.icrc2_approve(approveArgs);
    expect(hasVariant(first, "Ok")).toBe(true);
    const duplicate = await s.ledgers[0].actor.icrc2_approve(approveArgs);
    expect(hasVariant(duplicate, "Err")).toBe(true);
    expect(hasVariant(duplicate.Err, "Duplicate")).toBe(true);

    const future = await s.ledgers[0].actor.icrc2_approve({
      ...approveArgs,
      memo: [[4, 5, 6]],
      created_at_time: [now + 24n * 60n * 60n * 1_000_000_000n],
    });
    expect(hasVariant(future, "Err")).toBe(true);
    expect(hasVariant(future.Err, "CreatedInFuture")).toBe(true);
    expect(await s.dex.actor.balances(s.users[0].getPrincipal())).toEqual([]);
  });
});
