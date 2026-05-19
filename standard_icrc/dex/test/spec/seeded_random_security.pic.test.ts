import { afterAll, afterEach, describe, test } from "bun:test";
import { ledgerKey, poolKey, stopPocketIcServer } from "../../../../shared/common/runtime.ts";
import {
  createDexScenario,
  expectOk,
  SeededRandom,
  type DexScenario,
} from "./support/dexScenario.ts";

describe("seeded random security actions", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("deterministic mixed actions preserve the off-chain oracle after every action", async () => {
    s = await createDexScenario({
      name: "seeded-random",
      ledgerCount: 5,
      userCount: 50,
      initialExternalBalance: 5_000_000n,
    });
    await s.whitelistAll();
    const pairs = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ] as const;
    for (const [a, b] of pairs) {
      expectOk(await s.createPool(a, b));
    }

    for (let user = 0; user < s.users.length; user += 1) {
      for (let ledger = 0; ledger < s.ledgers.length; ledger += 1) {
        expectOk(await s.approveAndDeposit(user, ledger, 100_000n, { checkExternal: false }));
      }
    }
    for (let i = 0; i < pairs.length; i += 1) {
      const [a, b] = pairs[i];
      expectOk(await s.addLiquidity(i % 5, a, b, 20_000n, 20_000n, 0n, { checkExternal: false }));
    }
    await s.assertAll();

    const rng = new SeededRandom(0x51a7e);
    for (let i = 0; i < 1000; i += 1) {
      const user = rng.int(s.users.length);
      const [a, b] = pairs[rng.int(pairs.length)];
      const direction = rng.int(2) === 0;
      const ledgerIn = direction ? a : b;
      const ledgerOut = direction ? b : a;
      const amount = rng.amount(100n, 5_000n);
      const checkExternal = i % 100 === 0;
      switch (rng.int(5)) {
        case 0:
          await s.swap(user, ledgerIn, ledgerOut, amount, 0n, { checkExternal });
          break;
        case 1:
          await s.addLiquidity(user, a, b, amount, amount + BigInt(rng.int(1000)), 0n, {
            checkExternal,
          });
          break;
        case 2: {
          const key = poolKey(s.ledgers[a].canisterId, s.ledgers[b].canisterId);
          const shares = s.model.balance(s.users[user].getPrincipal(), key);
          await s.removeLiquidity(user, a, b, shares > 0n ? 1n + (shares % 10n) : 1n, 0n, 0n, {
            checkExternal,
          });
          break;
        }
        case 3: {
          const local = s.model.balance(s.users[user].getPrincipal(), ledgerKey(s.ledgers[ledgerIn].canisterId));
          await s.withdraw(user, ledgerIn, local > 20_000n ? 1_000n : amount, { checkExternal });
          break;
        }
        default:
          await s.quote(ledgerIn, ledgerOut, amount, 0n);
          await s.assertUser(user);
      }
    }
    await s.assertAll();
  });
});
