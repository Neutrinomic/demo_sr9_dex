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
import { deployBasketDao, type BasketDaoFixture } from "../fixtures/actors/basketDao/basketDaoHarness.ts";
import { deployBasketDex, type BasketDexFixture } from "../fixtures/actors/basketDex/basketDexHarness.ts";

const IDENTITY_NAMES = ["alice", "bob", "ledgerA", "ledgerB"] as const;

type Env = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  alice: TestRuntime<typeof IDENTITY_NAMES>["identities"]["alice"];
  bob: TestRuntime<typeof IDENTITY_NAMES>["identities"]["bob"];
  ledgerA: TestRuntime<typeof IDENTITY_NAMES>["identities"]["ledgerA"];
  ledgerB: TestRuntime<typeof IDENTITY_NAMES>["identities"]["ledgerB"];
  dao: BasketDaoFixture;
  dex: BasketDexFixture;
};

describe("102-A canonical basket discovery", () => {
  let env: Env | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("client discovers described nodes, quotes, and executes add liquidity", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 1n);
    await env.runtime.callAs(env.dex.actor, env.alice, (actor) => actor.setup_credit(account, 100n, 100n));

    const discovery = await env.dex.actor.spi_102_discover(discoverRequest(account));
    expect(discovery.nodes).toHaveLength(3);
    expect(discovery.edges).toHaveLength(2);
    expectEdgesExplainNodes(discovery);

    const add = edgeByNamespace(discovery, "add-liquidity");
    const quote = unwrapOk<any>(await quoteEdge(env, account, add.edge.edgeId, 40n));
    expect(quote.input).toHaveLength(2);
    expect(quote.output[0].amount).toBe(40n);

    const receipt = unwrapOk<any>(await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
      actor.spi_102_execute(executeRequest(quote)),
    ));
    expect(receipt.output[0].amount).toBe(40n);
    expect(walletAmounts(await wallet(env, account))).toEqual([60n, 60n, 40n]);
  });

  test("client executes swap and sees guard rejection", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 2n);
    await env.runtime.callAs(env.dex.actor, env.alice, (actor) => actor.setup_credit(account, 100n, 0n));
    const discovery = await env.dex.actor.spi_102_discover(discoverRequest(account));
    const swap = edgeByNamespace(discovery, "swap-a-to-b");
    const quote = unwrapOk<any>(await quoteEdge(env, account, swap.edge.edgeId, 25n));

    const badGuard = executeRequest(quote);
    badGuard.guard.minReceive = [{ node: quote.output[0].node, amount: 26n }];
    expectErrKey(await env.runtime.callAs(env.dex.actor, env.alice, (actor) => actor.spi_102_execute(badGuard)), "guardRejected");

    const receipt = unwrapOk<any>(await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
      actor.spi_102_execute(executeRequest(quote)),
    ));
    expect(receipt.input[0].amount).toBe(25n);
    expect(walletAmounts(await wallet(env, account))).toEqual([75n, 25n, 0n]);
  });

  test("client discovers DAO positions and executes pending unstake transition", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 3n);
    await env.runtime.callAs(env.dao.actor, env.alice, (actor) => actor.setup_credit(account, 100n));

    const discovery = await env.dao.actor.spi_102_discover(discoverRequest(account));
    expect(discovery.nodes).toHaveLength(3);
    expect(discovery.edges).toHaveLength(2);
    expectEdgesExplainNodes(discovery);

    const stake = edgeByNamespace(discovery, "stake");
    const stakeQuote = unwrapOk<any>(await quoteDaoEdge(env, account, stake.edge.edgeId, 40n));
    unwrapOk<any>(await executeDao(env, stakeQuote));
    expect(await env.dao.actor.raw_balances()).toEqual([60n, 40n, 0n]);

    const requestUnstake = edgeByNamespace(discovery, "request-unstake");
    const unstakeQuote = unwrapOk<any>(await quoteDaoEdge(env, account, requestUnstake.edge.edgeId, 25n));
    unwrapOk<any>(await executeDao(env, unstakeQuote));
    expect(await env.dao.actor.raw_balances()).toEqual([60n, 15n, 25n]);
  });
});

async function setup(): Promise<Env> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi102a",
  });
  const { alice, bob, ledgerA, ledgerB } = runtime.identities;
  const dao = await deployBasketDao(runtime.pic, ledgerA.getPrincipal());
  const dex = await deployBasketDex(runtime.pic, ledgerA.getPrincipal(), ledgerB.getPrincipal());
  return { runtime, alice, bob, ledgerA, ledgerB, dao, dex };
}

function discoverRequest(account: Uint8Array) {
  return { account, cursor: [], limit: [], filter: [] };
}

async function quoteEdge(env: Env, account: Uint8Array, edgeId: any, amount: bigint) {
  return env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
    actor.spi_102_quote({
      account,
      edgeId,
      intent: { amount, positionId: [], extension: [] },
    }),
  );
}

async function quoteDaoEdge(env: Env, account: Uint8Array, edgeId: any, amount: bigint) {
  return env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
    actor.spi_102_quote({
      account,
      edgeId,
      intent: { amount, positionId: [], extension: [] },
    }),
  );
}

async function executeDao(env: Env, quote: any) {
  return env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
    actor.spi_102_execute(executeRequest(quote)),
  );
}

function executeRequest(quote: any) {
  return {
    quote,
    guard: {
      minReceive: quote.output,
      maxSpend: quote.input,
      deadline: [],
      maxFee: quote.fees,
      maxPriceImpact: [],
      minShares: [],
      maxDebt: [],
      minHealth: [],
      extension: [],
    },
  };
}

async function wallet(env: Env, account: Uint8Array) {
  return env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
    actor.spi_101_wallet({ account, cursor: [], limit: [], filter: [] }),
  );
}

function walletAmounts(result: unknown): bigint[] {
  return unwrapOk<any>(result).entries.map((entry: any) => entry.holding.fungible.amount);
}

function edgeByNamespace(discovery: any, namespace: string): any {
  const found = discovery.edges.find((entry: any) => entry.edge.edgeId.namespace === namespace);
  if (found === undefined) {
    throw new Error(`missing edge ${namespace}`);
  }
  return found;
}

function expectEdgesExplainNodes(discovery: any): void {
  const nodes = new Set(discovery.nodes.map((node: any) => nodeKey(node.nodeId)));
  for (const entry of discovery.edges) {
    for (const node of [...entry.edge.inputNodes, ...entry.edge.outputNodes]) {
      expect(nodes.has(nodeKey(node))).toBe(true);
    }
  }
}

function nodeKey(node: any): string {
  const key = variantKey(node);
  if (key === "ledger") {
    return `ledger:${node.ledger.toText()}`;
  }
  return `local:${Buffer.from(node.local).toString("hex")}`;
}

function accountFor(wallet: Principal, id: bigint): Uint8Array {
  const account = encodeSpi100Account(wallet, id);
  if (account === null) {
    throw new Error("failed to encode SPI-100 account");
  }
  return new Uint8Array(account);
}

function expectErrKey(value: unknown, key: string): void {
  expect(variantKey(value)).toBe("err");
  expect(variantKey((value as { err: unknown }).err)).toBe(key);
}
