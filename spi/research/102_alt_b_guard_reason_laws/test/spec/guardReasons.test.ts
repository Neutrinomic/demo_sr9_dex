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
import { deployGuardDao, type GuardDaoFixture } from "../fixtures/actors/guardDao/guardDaoHarness.ts";
import { deployGuardDex, type GuardDexFixture } from "../fixtures/actors/guardDex/guardDexHarness.ts";

const IDENTITY_NAMES = ["alice", "ledger", "tokenB"] as const;

type Env = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  alice: TestRuntime<typeof IDENTITY_NAMES>["identities"]["alice"];
  ledger: TestRuntime<typeof IDENTITY_NAMES>["identities"]["ledger"];
  tokenB: TestRuntime<typeof IDENTITY_NAMES>["identities"]["tokenB"];
  dao: GuardDaoFixture;
  dex: GuardDexFixture;
};

describe("102-B guard reason laws", () => {
  let env: Env | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("DAO client executes stake and request-unstake pending transition", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 1n);
    await env.runtime.callAs(env.dao.actor, env.alice, (actor) => actor.setup_credit(account, 100n));
    const discovery = await env.dao.actor.spi_102_discover(discoverRequest(account));
    const stake = edgeByNamespace(discovery, "stake");
    const stakeQuote = unwrapOk<any>(await quoteEdge(env, account, stake.edge.edgeId, 40n));
    unwrapOk<any>(await execute(env, stakeQuote));
    expect(await env.dao.actor.raw_balances()).toEqual([59n, 40n, 0n]);

    const unstake = edgeByNamespace(discovery, "request-unstake");
    const unstakeQuote = unwrapOk<any>(await quoteEdge(env, account, unstake.edge.edgeId, 25n));
    unwrapOk<any>(await execute(env, unstakeQuote));
    expect(await env.dao.actor.raw_balances()).toEqual([58n, 15n, 25n]);
  });

  test("execute returns concrete guard rejection reasons", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 2n);
    await env.runtime.callAs(env.dao.actor, env.alice, (actor) => actor.setup_credit(account, 100n));
    const stake = edgeByNamespace(await env.dao.actor.spi_102_discover(discoverRequest(account)), "stake");

    const deadlineQuote = unwrapOk<any>(await quoteEdge(env, account, stake.edge.edgeId, 10n));
    const deadlineReq = executeRequest(deadlineQuote);
    deadlineReq.guard.deadline = [0n];
    expectGuardReason(await execute(env, deadlineQuote, deadlineReq.guard), "deadline");

    const minQuote = unwrapOk<any>(await quoteEdge(env, account, stake.edge.edgeId, 10n));
    const minReq = executeRequest(minQuote);
    minReq.guard.minReceive = [{ node: minQuote.output[0].node, amount: 11n }];
    expectGuardReason(await execute(env, minQuote, minReq.guard), "minReceive");

    const spendQuote = unwrapOk<any>(await quoteEdge(env, account, stake.edge.edgeId, 10n));
    const spendReq = executeRequest(spendQuote);
    spendReq.guard.maxSpend = [{ node: spendQuote.input[0].node, amount: 9n }];
    expectGuardReason(await execute(env, spendQuote, spendReq.guard), "maxSpend");

    const feeQuote = unwrapOk<any>(await quoteEdge(env, account, stake.edge.edgeId, 10n));
    const feeReq = executeRequest(feeQuote);
    feeReq.guard.maxFee = [{ node: feeQuote.fees[0].node, amount: 0n }];
    expectGuardReason(await execute(env, feeQuote, feeReq.guard), "maxFee");
  });

  test("stale quote rejection is separate from guard rejection", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 3n);
    await env.runtime.callAs(env.dao.actor, env.alice, (actor) => actor.setup_credit(account, 100n));
    const stake = edgeByNamespace(await env.dao.actor.spi_102_discover(discoverRequest(account)), "stake");
    const quote = unwrapOk<any>(await quoteEdge(env, account, stake.edge.edgeId, 10n));
    await env.dao.actor.advance_time(20n);
    expectErrKey(await execute(env, quote), "expiredQuote");
  });

  test("failed execute does not mutate wallet-visible state", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 4n);
    await env.runtime.callAs(env.dao.actor, env.alice, (actor) => actor.setup_credit(account, 30n));
    const stake = edgeByNamespace(await env.dao.actor.spi_102_discover(discoverRequest(account)), "stake");
    const before = await walletSnapshot(env, account);

    const guardQuote = unwrapOk<any>(await quoteEdge(env, account, stake.edge.edgeId, 10n));
    const guardReq = executeRequest(guardQuote);
    guardReq.guard.minReceive = [{ node: guardQuote.output[0].node, amount: 11n }];
    expectGuardReason(await execute(env, guardQuote, guardReq.guard), "minReceive");
    expect(await walletSnapshot(env, account)).toEqual(before);

    const tooLargeQuote = unwrapOk<any>(await quoteEdge(env, account, stake.edge.edgeId, 100n));
    expectErrKey(await execute(env, tooLargeQuote), "insufficientInput");
    expect(await walletSnapshot(env, account)).toEqual(before);
  });

  test("DEX example executes swap and conserves value minus fee", async () => {
    env = await setup();
    const account = accountFor(env.alice.getPrincipal(), 5n);
    await env.runtime.callAs(env.dex.actor, env.alice, (actor) => actor.setup_credit(account, 100n, 0n));
    const discovery = await env.dex.actor.spi_102_discover(discoverRequest(account));
    const swap = edgeByNamespace(discovery, "swap-a-to-b");

    const quote = unwrapOk<any>(await quoteDexEdge(env, account, swap.edge.edgeId, 25n));
    unwrapOk<any>(await executeDex(env, quote));
    expect(await env.dex.actor.raw_balances()).toEqual([74n, 25n]);
  });
});

async function setup(): Promise<Env> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi102b",
  });
  const { alice, ledger, tokenB } = runtime.identities;
  const dao = await deployGuardDao(runtime.pic, ledger.getPrincipal());
  const dex = await deployGuardDex(runtime.pic, ledger.getPrincipal(), tokenB.getPrincipal());
  return { runtime, alice, ledger, tokenB, dao, dex };
}

function discoverRequest(account: Uint8Array) {
  return { account, cursor: [], limit: [], filter: [] };
}

async function quoteEdge(env: Env, account: Uint8Array, edgeId: any, amount: bigint) {
  return env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
    actor.spi_102_quote({
      account,
      edgeId,
      intent: { amount, positionId: [], extension: [] },
    }),
  );
}

async function quoteDexEdge(env: Env, account: Uint8Array, edgeId: any, amount: bigint) {
  return env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
    actor.spi_102_quote({
      account,
      edgeId,
      intent: { amount, positionId: [], extension: [] },
    }),
  );
}

async function execute(env: Env, quote: any, guard = executeRequest(quote).guard) {
  return env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
    actor.spi_102_execute({ quote, guard }),
  );
}

async function executeDex(env: Env, quote: any, guard = executeRequest(quote).guard) {
  return env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
    actor.spi_102_execute({ quote, guard }),
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

function edgeByNamespace(discovery: any, namespace: string): any {
  const found = discovery.edges.find((entry: any) => entry.edge.edgeId.namespace === namespace);
  if (found === undefined) {
    throw new Error(`missing edge ${namespace}`);
  }
  return found;
}

function accountFor(wallet: Principal, id: bigint): Uint8Array {
  const account = encodeSpi100Account(wallet, id);
  if (account === null) {
    throw new Error("failed to encode SPI-100 account");
  }
  return new Uint8Array(account);
}

async function walletSnapshot(env: Env, account: Uint8Array): Promise<string[]> {
  const receipt = unwrapOk<any>(
    await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_101_wallet({ account, cursor: [], limit: [], filter: [] }),
    ),
  );
  return receipt.entries.map((entry: any) => {
    const holdingKind = variantKey(entry.holding);
    const holding =
      holdingKind === "fungible"
        ? `fungible:${entry.holding.fungible.amount}`
        : `nonfungible:${entry.holding.nonfungible.id}`;
    return [
      nodeKey(entry.node),
      holding,
      statusKey(entry.status),
      optionalText(entry.displayLabel),
    ].join("|");
  });
}

function nodeKey(node: any): string {
  const key = variantKey(node);
  if (key === "ledger") {
    return `ledger:${node.ledger.toText()}`;
  }
  return `local:${Buffer.from(node.local).toString("hex")}`;
}

function statusKey(status: any): string {
  const key = variantKey(status);
  if (key === "available") {
    return "available";
  }
  const unlockAt = optionalValue(status[key].unlockAt);
  return `${key}:${unlockAt}`;
}

function optionalText(value: unknown): string {
  return optionalValue(value);
}

function optionalValue(value: any): string {
  if (!Array.isArray(value) || value.length === 0) {
    return "";
  }
  return String(value[0]);
}

function expectErrKey(value: unknown, key: string): void {
  expect(variantKey(value)).toBe("err");
  expect(variantKey((value as { err: unknown }).err)).toBe(key);
}

function expectGuardReason(value: unknown, reason: string): void {
  expectErrKey(value, "guardRejected");
  expect(variantKey((value as any).err.guardRejected)).toBe(reason);
}
