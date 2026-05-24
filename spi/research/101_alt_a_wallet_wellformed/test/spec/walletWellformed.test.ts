import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  Principal,
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../../shared/common/runtime.ts";
import { encodeSpi100Account } from "../../../../../shared/common/spi100.ts";
import {
  createTestRuntime,
  type TestRuntime,
} from "../../../../../shared/common/runtime.ts";
import {
  deployWalletWellformed,
  type WalletWellformedFixture,
} from "../fixtures/actors/walletWellformed/walletWellformedHarness.ts";

const IDENTITIES = ["alice", "bob", "ledger"] as const;

type Env = {
  runtime: TestRuntime<typeof IDENTITIES>;
  actor: WalletWellformedFixture;
};

describe("101-A wallet well-formed kernel", () => {
  let env: Env | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("authorized client reads mixed wallet entries", async () => {
    env = await setup();
    const alice = env.runtime.identity("alice");
    const ledger = env.runtime.principal("ledger");
    const account = accountFor(alice.getPrincipal(), 1n);

    const receipt = unwrapOk<any>(
      await env.runtime.callAs(env.actor.actor, alice, (actor) =>
        actor.spi_101_wallet(walletRequest(account)),
      ),
    );

    expect(bytes(receipt.account)).toEqual(bytes(account));
    expect(receipt.entries).toHaveLength(4);
    expect(fungibleAmount(receipt, "ledger", ledger)).toBe(100n);
    expect(fungibleAmount(receipt, "local")).toBe(25n);
    expect(nonfungibleIds(receipt)).toEqual([7n, 8n]);
    expect(variantKey(receipt.entries[3].status)).toBe("locked");
  });

  test("unauthorized client is rejected", async () => {
    env = await setup();
    const alice = env.runtime.identity("alice");
    const bob = env.runtime.identity("bob");
    const account = accountFor(alice.getPrincipal(), 2n);

    const result = await env.runtime.callAs(env.actor.actor, bob, (actor) =>
      actor.spi_101_wallet(walletRequest(account)),
    );

    expect(variantKey(result)).toBe("err");
    expect(variantKey((result as any).err)).toBe("accountNotAuthorized");
  });
});

async function setup(): Promise<Env> {
  const runtime = await createTestRuntime({
    identities: IDENTITIES,
    identityPrefix: "spi101a",
  });
  const actor = await deployWalletWellformed(
    runtime.pic,
    runtime.principal("ledger"),
  );
  return { runtime, actor };
}

function walletRequest(account: Uint8Array) {
  return { account, cursor: [], limit: [], filter: [] };
}

function accountFor(wallet: Principal, id: bigint): Uint8Array {
  const account = encodeSpi100Account(wallet, id);
  if (account === null) {
    throw new Error("failed to encode account");
  }
  return new Uint8Array(account);
}

function fungibleAmount(receipt: any, kind: "ledger" | "local", ledger?: Principal): bigint {
  const found = receipt.entries.find((entry: any) => {
    if (variantKey(entry.holding) !== "fungible") {
      return false;
    }
    const nodeKey = variantKey(entry.node);
    if (kind === "local") {
      return nodeKey === "local";
    }
    return nodeKey === "ledger" && entry.node.ledger.toText() === ledger?.toText();
  });
  return found?.holding.fungible.amount ?? 0n;
}

function nonfungibleIds(receipt: any): bigint[] {
  return receipt.entries
    .filter((entry: any) => variantKey(entry.holding) === "nonfungible")
    .map((entry: any) => entry.holding.nonfungible.id);
}

function bytes(value: Uint8Array | number[] | ArrayBuffer): number[] {
  return Array.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
}
