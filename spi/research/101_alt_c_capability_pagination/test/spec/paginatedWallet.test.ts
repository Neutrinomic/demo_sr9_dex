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
  deployPaginatedWallet,
  type PaginatedWalletFixture,
} from "../fixtures/actors/paginatedWallet/paginatedWalletHarness.ts";

const IDENTITIES = ["alice", "bob", "ledger"] as const;

type Env = {
  runtime: TestRuntime<typeof IDENTITIES>;
  actor: PaginatedWalletFixture;
};

describe("101-C paginated wallet", () => {
  let env: Env | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("client reconstructs all pages with monotonic cursors", async () => {
    env = await setup();
    const alice = env.runtime.identity("alice");
    const account = accountFor(alice.getPrincipal(), 1n);

    const first = unwrapOk<any>(await page(env, alice, account, []));
    expect(first.entries).toHaveLength(2);
    expect(first.nextCursor).toEqual([2n]);

    const second = unwrapOk<any>(await page(env, alice, account, [2n]));
    expect(second.entries).toHaveLength(2);
    expect(second.nextCursor).toEqual([4n]);

    const third = unwrapOk<any>(await page(env, alice, account, [4n]));
    expect(third.entries).toHaveLength(1);
    expect(third.nextCursor).toEqual([]);
  });

  test("unauthorized and invalid cursors are rejected", async () => {
    env = await setup();
    const alice = env.runtime.identity("alice");
    const bob = env.runtime.identity("bob");
    const account = accountFor(alice.getPrincipal(), 2n);

    expect(variantKey(await page(env, bob, account, []))).toBe("err");
    expect(variantKey(await page(env, alice, account, [1n]))).toBe("err");
  });
});

async function setup(): Promise<Env> {
  const runtime = await createTestRuntime({
    identities: IDENTITIES,
    identityPrefix: "spi101c",
  });
  const actor = await deployPaginatedWallet(runtime.pic, runtime.principal("ledger"));
  return { runtime, actor };
}

async function page(env: Env, caller: any, account: Uint8Array, cursor: [] | [bigint]) {
  return env.runtime.callAs(env.actor.actor, caller, (actor) =>
    actor.spi_101_wallet({ account, cursor, limit: [2n], filter: ["all"] }),
  );
}

function accountFor(wallet: Principal, id: bigint): Uint8Array {
  const account = encodeSpi100Account(wallet, id);
  if (account === null) {
    throw new Error("failed to encode account");
  }
  return new Uint8Array(account);
}
