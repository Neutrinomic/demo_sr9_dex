import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  Principal,
  createTestRuntime,
  stopPocketIcServer,
  unwrapOk,
  variantKey,
  type TestRuntime,
} from "../../../../../shared/common/runtime.ts";
import { encodeSpi100Account } from "../../../../../shared/common/spi100.ts";
import {
  deployBalanceBookWallet,
  type BalanceBookWalletFixture,
} from "../fixtures/actors/balanceBookWallet/balanceBookWalletHarness.ts";

const IDENTITIES = ["alice", "bob", "ledger"] as const;

type Env = {
  runtime: TestRuntime<typeof IDENTITIES>;
  actor: BalanceBookWalletFixture;
};

describe("101-B balance book wallet", () => {
  let env: Env | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("client sees ledger and local balances exported from the book", async () => {
    env = await setup();
    const alice = env.runtime.identity("alice");
    const account = accountFor(alice.getPrincipal(), 1n);

    await env.runtime.callAs(env.actor.actor, alice, (actor) =>
      actor.setup_credit_ledger(account, 100n),
    );
    await env.runtime.callAs(env.actor.actor, alice, (actor) =>
      actor.setup_credit_local(account, 25n),
    );

    const receipt = unwrapOk<any>(
      await env.runtime.callAs(env.actor.actor, alice, (actor) =>
        actor.spi_101_wallet({ account, cursor: [], limit: [], filter: [] }),
      ),
    );

    expect(receipt.entries).toHaveLength(2);
    expect(sumFungible(receipt)).toBe(125n);
  });

  test("unauthorized setup and wallet reads cannot use another account", async () => {
    env = await setup();
    const alice = env.runtime.identity("alice");
    const bob = env.runtime.identity("bob");
    const account = accountFor(alice.getPrincipal(), 2n);

    expect(
      await env.runtime.callAs(env.actor.actor, bob, (actor) =>
        actor.setup_credit_ledger(account, 100n),
      ),
    ).toBe(0n);

    const result = await env.runtime.callAs(env.actor.actor, bob, (actor) =>
      actor.spi_101_wallet({ account, cursor: [], limit: [], filter: [] }),
    );
    expect(variantKey(result)).toBe("err");
  });
});

async function setup(): Promise<Env> {
  const runtime = await createTestRuntime({
    identities: IDENTITIES,
    identityPrefix: "spi101b",
  });
  const actor = await deployBalanceBookWallet(runtime.pic, runtime.principal("ledger"));
  return { runtime, actor };
}

function accountFor(wallet: Principal, id: bigint): Uint8Array {
  const account = encodeSpi100Account(wallet, id);
  if (account === null) {
    throw new Error("failed to encode account");
  }
  return new Uint8Array(account);
}

function sumFungible(receipt: any): bigint {
  return receipt.entries.reduce((sum: bigint, entry: any) => {
    if (variantKey(entry.holding) !== "fungible") {
      return sum;
    }
    return sum + entry.holding.fungible.amount;
  }, 0n);
}
