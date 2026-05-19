import { afterAll, afterEach, describe, test } from "bun:test";
import { ledgerKey, poolKey, stopPocketIcServer } from "../common/runtime.ts";
import {
  createDexScenario,
  expectOk,
  SeededRandom,
  type DexScenario,
} from "./support/dexScenario.ts";

const slowTest =
  process.env.E2E_INCLUDE_SLOW === "1" || process.env.E2E_INCLUDE_SLOW === "true"
    ? test
    : test.skip;

describe("large population stress", () => {
  let s: DexScenario | undefined;

  afterEach(async () => {
    await s?.tearDown();
    s = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  slowTest("populates 20 ledgers, 50 pools, 5000 users, and many mixed actions", async () => {
    const ledgerCount = Number.parseInt(process.env.E2E_STRESS_LEDGERS ?? "20", 10);
    const poolCount = Number.parseInt(process.env.E2E_STRESS_POOLS ?? "50", 10);
    const userCount = Number.parseInt(process.env.E2E_STRESS_USERS ?? "5000", 10);
    const actionCount = Number.parseInt(process.env.E2E_STRESS_ACTIONS ?? "20000", 10);

    s = await createDexScenario({
      name: "large-population",
      ledgerCount,
      userCount,
      initialExternalBalance: 0n,
    });
    await s.whitelistAll();

    const pairs: Array<[number, number]> = [];
    for (let a = 0; a < ledgerCount && pairs.length < poolCount; a += 1) {
      for (let b = a + 1; b < ledgerCount && pairs.length < poolCount; b += 1) {
        pairs.push([a, b]);
        expectOk(await s.createPool(a, b));
      }
    }

    for (let user = 0; user < userCount; user += 1) {
      const ledger = user % ledgerCount;
      await s.fund(user, ledger, 250_000n);
      expectOk(await s.approveAndDeposit(user, ledger, 100_000n, { checkExternal: false }));
    }

    for (let i = 0; i < pairs.length; i += 1) {
      const [a, b] = pairs[i];
      const user = i % Math.min(userCount, 100);
      await s.fund(user, a, 2_000_000n);
      await s.fund(user, b, 2_000_000n);
      expectOk(await s.approveAndDeposit(user, a, 1_000_000n, { checkExternal: false }));
      expectOk(await s.approveAndDeposit(user, b, 1_000_000n, { checkExternal: false }));
      expectOk(await s.addLiquidity(user, a, b, 500_000n, 500_000n, 0n, { checkExternal: false }));
    }
    await s.assertAll({ external: false });

    const rng = new SeededRandom(0x0de200);
    for (let i = 0; i < actionCount; i += 1) {
      const user = rng.int(userCount);
      const [a, b] = pairs[rng.int(pairs.length)];
      const direction = rng.int(2) === 0;
      const ledgerIn = direction ? a : b;
      const ledgerOut = direction ? b : a;
      const amount = rng.amount(100n, 10_000n);
      const checkExternal = i % 1000 === 0;

      switch (rng.int(6)) {
        case 0:
          await s.fund(user, ledgerIn, amount + 50_000n);
          expectOk(await s.approveAndDeposit(user, ledgerIn, amount + 20_000n, { checkExternal: false }));
          break;
        case 1:
          await s.swap(user, ledgerIn, ledgerOut, amount, 0n, { checkExternal });
          break;
        case 2:
          await s.addLiquidity(user, a, b, amount, amount, 0n, { checkExternal });
          break;
        case 3: {
          const key = poolKey(s.ledgers[a].canisterId, s.ledgers[b].canisterId);
          const shares = s.model.balance(s.users[user].getPrincipal(), key);
          await s.removeLiquidity(user, a, b, shares > 10n ? shares / 10n : 1n, 0n, 0n, {
            checkExternal,
          });
          break;
        }
        case 4: {
          const local = s.model.balance(s.users[user].getPrincipal(), ledgerKey(s.ledgers[ledgerIn].canisterId));
          await s.withdraw(user, ledgerIn, local > 20_000n ? 1_000n : amount, { checkExternal });
          break;
        }
        default:
          await s.quote(ledgerIn, ledgerOut, amount, 0n);
          await s.assertUser(user);
      }
    }

    await s.assertAll({ external: false });
  });
});
