import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  Principal,
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import { encodeSpi100Account } from "../../../../shared/common/spi100.ts";
import { setupSpi102E2E, type Spi102E2E } from "./spi102TestEnv.ts";

type Opt<T> = [] | [T];

type IcrcAccount = {
  owner: Principal;
  subaccount: Opt<Uint8Array | number[]>;
};

type EdgeId = {
  scope: Principal;
  namespace: string;
  id: bigint;
};

type NodeId = { ledger: Principal } | { local: Uint8Array | number[] };

type BasketEntry = {
  node: NodeId;
  amount: bigint;
};

type PositionEffect = {
  node: NodeId;
  positionId: Opt<bigint>;
  amount: bigint;
  unlockAt: Opt<bigint>;
  metadata: Opt<string>;
};

type Quote = {
  account: Uint8Array | number[];
  edgeId: EdgeId;
  input: BasketEntry[];
  output: BasketEntry[];
  positionInputs: PositionEffect[];
  positionOutputs: PositionEffect[];
  fees: BasketEntry[];
  expiresAt: Opt<bigint>;
  preconditions: Opt<string>;
  witness: Opt<string>;
};

type WalletHolding =
  | { fungible: { amount: bigint; meta: null } }
  | { nonfungible: { id: bigint; meta: null } };

type WalletEntry = {
  node: NodeId;
  holding: WalletHolding;
  status: unknown;
  displayAsset: Opt<NodeId>;
  displayLabel: Opt<string>;
};

type WalletReceipt = {
  account: Uint8Array | number[];
  entries: WalletEntry[];
};

describe("SPI-102 client discover/quote/execute", () => {
  let env: Spi102E2E | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("DEX client discovers graph nodes, adds liquidity, swaps, and observes SPI-101 wallet holdings", async () => {
    env = await setupSpi102E2E();
    const account = accountFor(env.alice.getPrincipal(), 1n);
    const tokenA = env.runtime.principal("tokenA");
    const tokenB = env.runtime.principal("tokenB");
    const lpNode = localNode([1]);

    await expectActorAccount(env.dex.actor, env.alice.getPrincipal(), 1n, account);
    expectOkDepositAfter(await dexDeposit(env, account, tokenA, 1_000n), 1_000n);
    expectOkDepositAfter(await dexDeposit(env, account, tokenB, 1_000n), 1_000n);

    const discovered = await env.runtime.callAs(
      env.dex.actor,
      env.alice,
      (actor) => actor.spi_102_discover(discoverRequest(account)),
    );
    expect(bytes(discovered.account)).toEqual(bytes(account));
    expect(discovered.nodes).toHaveLength(3);
    expect(discovered.edges).toHaveLength(4);
    expectEdgesExplainNodes(discovered);
    expectNodeForms(discovered, "fungible");
    expect(statusKey(edgeByNamespace(discovered, "add-liquidity").status)).toBe(
      "live",
    );
    expect(statusKey(edgeByNamespace(discovered, "swap-a-b").status)).toBe(
      "insufficientInput",
    );

    const addLiquidity = edgeByNamespace(discovered, "add-liquidity");
    const addQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, addLiquidity.edge.edgeId, 100n)),
      ),
    );
    expect(bytes(addQuote.account)).toEqual(bytes(account));
    expect(addQuote.input).toEqual([
      { node: ledgerNode(tokenA), amount: 100n },
      { node: ledgerNode(tokenB), amount: 100n },
    ]);
    expect(addQuote.output).toEqual([{ node: lpNode, amount: 100n }]);

    const addReceipt = unwrapOk<Quote>(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(addQuote)),
      ),
    );
    expect(addReceipt.output).toEqual(addQuote.output);
    expect(await env.dex.actor.pool_state()).toEqual({
      reserveA: 100n,
      reserveB: 100n,
      totalLp: 100n,
    });
    expect(walletNodeAmount(await dexWallet(env, account), ledgerNode(tokenA))).toBe(
      900n,
    );
    expect(walletNodeAmount(await dexWallet(env, account), ledgerNode(tokenB))).toBe(
      900n,
    );
    expect(walletNodeAmount(await dexWallet(env, account), lpNode)).toBe(100n);

    const withLiquidity = await env.runtime.callAs(
      env.dex.actor,
      env.alice,
      (actor) => actor.spi_102_discover(discoverRequest(account)),
    );
    const swapAToB = edgeByNamespace(withLiquidity, "swap-a-b");
    expect(statusKey(swapAToB.status)).toBe("live");

    const swapQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, swapAToB.edge.edgeId, 50n)),
      ),
    );
    expect(swapQuote.input).toEqual([{ node: ledgerNode(tokenA), amount: 50n }]);
    expect(swapQuote.output).toEqual([
      { node: ledgerNode(tokenB), amount: 33n },
    ]);

    unwrapOk(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(swapQuote)),
      ),
    );
    expect(await env.dex.actor.pool_state()).toEqual({
      reserveA: 150n,
      reserveB: 67n,
      totalLp: 100n,
    });
    expect(walletNodeAmount(await dexWallet(env, account), ledgerNode(tokenA))).toBe(
      850n,
    );
    expect(walletNodeAmount(await dexWallet(env, account), ledgerNode(tokenB))).toBe(
      933n,
    );

    const beforeReject = await dexWallet(env, account);
    expectErr(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_execute(
          executeRequest(swapQuote, {
            minReceive: [{ node: ledgerNode(tokenB), amount: 34n }],
          }),
        ),
      ),
      "guardRejected",
    );
    expect(walletNodeAmount(await dexWallet(env, account), ledgerNode(tokenA))).toBe(
      walletNodeAmount(beforeReject, ledgerNode(tokenA)),
    );
    expect(walletNodeAmount(await dexWallet(env, account), ledgerNode(tokenB))).toBe(
      walletNodeAmount(beforeReject, ledgerNode(tokenB)),
    );
  });

  test("DEX client sees SPI-103 withdraw, authorization, unknown edge, zero amount, and expired quote failures", async () => {
    env = await setupSpi102E2E();
    const account = accountFor(env.alice.getPrincipal(), 2n);
    const tokenA = env.runtime.principal("tokenA");
    const tokenB = env.runtime.principal("tokenB");

    expectOkDepositAfter(await dexDeposit(env, account, tokenA, 1_000n), 1_000n);
    expectOkDepositAfter(await dexDeposit(env, account, tokenB, 1_000n), 1_000n);
    expectOkWithdrawAfter(await dexWithdraw(env, account, tokenA, 25n), 975n);
    expect(walletNodeAmount(await dexWallet(env, account), ledgerNode(tokenA))).toBe(
      975n,
    );

    const unauthorizedGraph = await env.runtime.callAs(
      env.dex.actor,
      env.bob,
      (actor) => actor.spi_102_discover(discoverRequest(account)),
    );
    expectAllEdgeStatuses(unauthorizedGraph, "unauthorized");
    expectErr(
      await env.runtime.callAs(env.dex.actor, env.bob, (actor) =>
        actor.spi_101_wallet(walletRequest(account)),
      ),
      "accountNotAuthorized",
    );

    const graph = await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    const addLiquidity = edgeByNamespace(graph, "add-liquidity");
    const swapAToB = edgeByNamespace(graph, "swap-a-b");
    const unknown = unknownEdge(swapAToB.edge.edgeId);

    expectErr(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, unknown, 10n)),
      ),
      "unknownEdge",
    );
    expectErr(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, swapAToB.edge.edgeId, 0n)),
      ),
      "invalidAmount",
    );
    expectErr(
      await env.runtime.callAs(env.dex.actor, env.bob, (actor) =>
        actor.spi_102_quote(quoteRequest(account, addLiquidity.edge.edgeId, 10n)),
      ),
      "accountNotAuthorized",
    );

    const addQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, addLiquidity.edge.edgeId, 100n)),
      ),
    );
    expectErr(
      await env.runtime.callAs(env.dex.actor, env.bob, (actor) =>
        actor.spi_102_execute(executeRequest(addQuote)),
      ),
      "accountNotAuthorized",
    );
    unwrapOk(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(addQuote)),
      ),
    );

    const expiringQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, swapAToB.edge.edgeId, 10n)),
      ),
    );
    await env.runtime.advanceSeconds(301);
    expectErr(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(expiringQuote)),
      ),
      "expiredQuote",
    );

    expectErr(
      await env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
        actor.spi_102_execute(
          executeRequest({
            ...expiringQuote,
            edgeId: unknown,
          }),
        ),
      ),
      "unknownEdge",
    );
  });

  test("DAO client uses pending unstake as an intermediate node and cancels or claims it", async () => {
    env = await setupSpi102E2E();
    const account = accountFor(env.alice.getPrincipal(), 3n);
    const governanceToken = env.runtime.principal("governanceToken");

    await expectActorAccount(env.dao.actor, env.alice.getPrincipal(), 3n, account);
    expectOkDepositAfter(
      await daoDeposit(env, account, governanceToken, 100n),
      100n,
    );

    const initial = await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    expect(bytes(initial.account)).toEqual(bytes(account));
    expect(initial.nodes).toHaveLength(3);
    expect(initial.edges).toHaveLength(4);
    expectEdgesExplainNodes(initial);
    expectNodeForms(initial, "fungible");

    const stake = edgeByNamespace(initial, "stake");
    expect(statusKey(stake.status)).toBe("live");
    const activeNode = stake.edge.outputNodes[0];
    const stakeQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, stake.edge.edgeId, 40n)),
      ),
    );
    unwrapOk(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(stakeQuote)),
      ),
    );
    expect(await env.dao.actor.state(account)).toMatchObject({
      liquid: 60n,
      active: 40n,
      pending: 0n,
    });
    expect(
      walletNodeAmount(await daoWallet(env, account), ledgerNode(governanceToken)),
    ).toBe(60n);
    expect(walletNodeAmount(await daoWallet(env, account), activeNode)).toBe(40n);

    const afterStake = await env.runtime.callAs(
      env.dao.actor,
      env.alice,
      (actor) => actor.spi_102_discover(discoverRequest(account)),
    );
    const requestUnstake = edgeByNamespace(afterStake, "request-unstake");
    expect(statusKey(requestUnstake.status)).toBe("live");
    const pendingNode = requestUnstake.edge.outputNodes[0];
    const unstakeQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(
          quoteRequest(account, requestUnstake.edge.edgeId, 25n),
        ),
      ),
    );
    expect(positionEffectAmount(unstakeQuote.positionOutputs)).toBe(25n);
    unwrapOk(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(unstakeQuote)),
      ),
    );

    const pendingState = await env.dao.actor.state(account);
    expect(pendingState.liquid).toBe(60n);
    expect(pendingState.active).toBe(15n);
    expect(pendingState.pending).toBe(25n);
    expect(pendingState.unlockAt).toBeGreaterThan(0n);
    expect(walletNodeAmount(await daoWallet(env, account), pendingNode)).toBe(25n);
    expect(walletStatusKey(await daoWallet(env, account), pendingNode)).toBe(
      "locked",
    );

    const pendingDiscovery = await env.runtime.callAs(
      env.dao.actor,
      env.alice,
      (actor) => actor.spi_102_discover(discoverRequest(account)),
    );
    expect(statusKey(edgeByNamespace(pendingDiscovery, "cancel-unstake").status))
      .toBe("live");
    expect(statusKey(edgeByNamespace(pendingDiscovery, "claim-unstaked").status))
      .toBe("notMature");

    const immatureClaim = edgeByNamespace(pendingDiscovery, "claim-unstaked");
    const immatureClaimQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, immatureClaim.edge.edgeId, 15n)),
      ),
    );
    expectErr(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(immatureClaimQuote)),
      ),
      "edgeNotLive",
    );
    expect(await env.dao.actor.state(account)).toMatchObject({
      liquid: 60n,
      active: 15n,
      pending: 25n,
    });

    const cancel = edgeByNamespace(pendingDiscovery, "cancel-unstake");
    const cancelQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, cancel.edge.edgeId, 10n)),
      ),
    );
    unwrapOk(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(cancelQuote)),
      ),
    );
    expect(await env.dao.actor.state(account)).toMatchObject({
      liquid: 60n,
      active: 25n,
      pending: 15n,
    });

    await env.runtime.advanceSeconds(3);

    const matured = await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    const claim = edgeByNamespace(matured, "claim-unstaked");
    expect(statusKey(claim.status)).toBe("live");
    const claimQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, claim.edge.edgeId, 15n)),
      ),
    );
    unwrapOk(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(claimQuote)),
      ),
    );
    expect(await env.dao.actor.state(account)).toEqual({
      liquid: 75n,
      active: 25n,
      pending: 0n,
      unlockAt: 0n,
    });
    expect(
      walletNodeAmount(await daoWallet(env, account), ledgerNode(governanceToken)),
    ).toBe(75n);
  });

  test("DAO client sees unauthorized discovery and account-bound quote execution", async () => {
    env = await setupSpi102E2E();
    const account = accountFor(env.alice.getPrincipal(), 4n);
    const governanceToken = env.runtime.principal("governanceToken");

    expectOkDepositAfter(
      await daoDeposit(env, account, governanceToken, 50n),
      50n,
    );

    const bobView = await env.runtime.callAs(env.dao.actor, env.bob, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    expectAllEdgeStatuses(bobView, "unauthorized");
    expectErr(
      await env.runtime.callAs(env.dao.actor, env.bob, (actor) =>
        actor.spi_101_wallet(walletRequest(account)),
      ),
      "accountNotAuthorized",
    );

    const aliceView = await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    const stake = edgeByNamespace(aliceView, "stake");
    const stakeQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, stake.edge.edgeId, 20n)),
      ),
    );

    expectErr(
      await env.runtime.callAs(env.dao.actor, env.bob, (actor) =>
        actor.spi_102_execute(executeRequest(stakeQuote)),
      ),
      "accountNotAuthorized",
    );
    expect(await env.dao.actor.state(account)).toEqual({
      liquid: 50n,
      active: 0n,
      pending: 0n,
      unlockAt: 0n,
    });

    expectErr(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(
          quoteRequest(account, unknownEdge(stake.edge.edgeId), 20n),
        ),
      ),
      "unknownEdge",
    );
  });
});

function discoverRequest(account: Uint8Array) {
  return {
    account,
    cursor: [],
    limit: [],
    filter: [],
  };
}

function walletRequest(account: Uint8Array) {
  return {
    account,
    cursor: [],
    limit: [],
    filter: [],
  };
}

async function dexWallet(env: Spi102E2E, account: Uint8Array): Promise<unknown> {
  return env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
    actor.spi_101_wallet(walletRequest(account)),
  );
}

async function daoWallet(env: Spi102E2E, account: Uint8Array): Promise<unknown> {
  return env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
    actor.spi_101_wallet(walletRequest(account)),
  );
}

async function dexDeposit(
  env: Spi102E2E,
  account: Uint8Array,
  ledger: Principal,
  amount: bigint,
): Promise<unknown> {
  return env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
    actor.spi_103_icrc_deposit({
      account,
      ledger,
      from: icrcAccount(env.alice.getPrincipal()),
      amount,
    }),
  );
}

async function daoDeposit(
  env: Spi102E2E,
  account: Uint8Array,
  ledger: Principal,
  amount: bigint,
): Promise<unknown> {
  return env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
    actor.spi_103_icrc_deposit({
      account,
      ledger,
      from: icrcAccount(env.alice.getPrincipal()),
      amount,
    }),
  );
}

async function dexWithdraw(
  env: Spi102E2E,
  account: Uint8Array,
  ledger: Principal,
  amount: bigint,
): Promise<unknown> {
  return env.runtime.callAs(env.dex.actor, env.alice, (actor) =>
    actor.spi_103_icrc_withdraw({
      account,
      ledger,
      to: icrcAccount(env.alice.getPrincipal()),
      amount,
    }),
  );
}

function quoteRequest(account: Uint8Array, edgeId: EdgeId, amount: bigint) {
  return {
    account,
    edgeId,
    intent: {
      amount,
      positionId: [],
      extension: [],
    },
  };
}

function executeRequest(
  quote: Quote,
  guard: Partial<ReturnType<typeof emptyGuard>> = {},
) {
  return {
    quote,
    guard: {
      ...emptyGuard(quote),
      ...guard,
    },
  };
}

function emptyGuard(quote?: Quote) {
  return {
    minReceive: quote?.output ?? [],
    maxSpend: quote?.input ?? [],
    deadline: [],
    maxFee: quote?.fees ?? [],
    maxPriceImpact: [],
    minShares: [],
    maxDebt: [],
    minHealth: [],
    extension: [],
  };
}

function edgeByNamespace(discovery: any, namespace: string): any {
  const found = discovery.edges.find(
    (entry: any) => entry.edge.edgeId.namespace === namespace,
  );
  if (found === undefined) {
    throw new Error(`missing discovery edge namespace ${namespace}`);
  }
  return found;
}

function expectAllEdgeStatuses(discovery: any, status: string): void {
  expect(discovery.edges.length).toBeGreaterThan(0);
  for (const entry of discovery.edges) {
    expect(statusKey(entry.status)).toBe(status);
  }
}

function expectNodeForms(discovery: any, form: string): void {
  for (const node of discovery.nodes) {
    expect(variantKey(node.form)).toBe(form);
  }
}

function statusKey(status: unknown): string {
  return variantKey(status);
}

function unknownEdge(edgeId: EdgeId): EdgeId {
  return {
    ...edgeId,
    namespace: `${edgeId.namespace}-unknown`,
    id: edgeId.id + 1_000n,
  };
}

function ledgerNode(ledger: Principal): NodeId {
  return { ledger };
}

function localNode(bytesValue: number[] | Uint8Array): NodeId {
  return { local: Uint8Array.from(bytesValue) };
}

function expectEdgesExplainNodes(discovery: any): void {
  const nodes = new Set(
    discovery.nodes.map((node: any) => nodeKey(node.nodeId)),
  );
  for (const entry of discovery.edges) {
    for (const input of entry.edge.inputNodes) {
      expect(nodes.has(nodeKey(input))).toBe(true);
    }
    for (const output of entry.edge.outputNodes) {
      expect(nodes.has(nodeKey(output))).toBe(true);
    }
  }
}

function nodeKey(node: NodeId): string {
  const key = variantKey(node);
  const value = (node as Record<string, any>)[key];
  if (key === "ledger") {
    return `${key}:${(value as Principal).toText()}`;
  }
  return `${key}:${bytes(value as Uint8Array | number[]).join(".")}`;
}

function positionEffectAmount(effects: Array<{ amount: bigint }>): bigint {
  return effects.reduce((sum, effect) => sum + effect.amount, 0n);
}

function walletNodeAmount(result: unknown, node: NodeId): bigint {
  const found = findWalletEntry(result, node);
  if (found === undefined) {
    return 0n;
  }
  expect(variantKey(found.holding)).toBe("fungible");
  return (found.holding as { fungible: { amount: bigint } }).fungible.amount;
}

function walletStatusKey(result: unknown, node: NodeId): string {
  const found = findWalletEntry(result, node);
  if (found === undefined) {
    throw new Error(`missing wallet node ${nodeKey(node)}`);
  }
  return variantKey(found.status);
}

function findWalletEntry(result: unknown, node: NodeId): WalletEntry | undefined {
  const receipt = unwrapOk<WalletReceipt>(result);
  return receipt.entries.find((entry) => nodeKey(entry.node) === nodeKey(node));
}

async function expectActorAccount(
  actor: any,
  wallet: Principal,
  id: bigint,
  expected: Uint8Array,
): Promise<void> {
  const encoded = await actor.spi_100_account(wallet, id);
  expect(encoded).toHaveLength(1);
  expect(bytes(encoded[0])).toEqual(bytes(expected));
}

function accountFor(wallet: Principal, id: bigint): Uint8Array {
  const account = encodeSpi100Account(wallet, id);
  if (account === null) {
    throw new Error("failed to encode SPI-100 account");
  }
  return new Uint8Array(account);
}

function icrcAccount(owner: Principal, subaccount?: Uint8Array): IcrcAccount {
  return {
    owner,
    subaccount: subaccount === undefined ? [] : [subaccount],
  };
}

function expectOkDepositAfter(value: unknown, amount: bigint): void {
  expect(unwrapOk<{ balanceAfter: bigint }>(value).balanceAfter).toBe(amount);
}

function expectOkWithdrawAfter(value: unknown, amount: bigint): void {
  expect(unwrapOk<{ balanceAfter: bigint }>(value).balanceAfter).toBe(amount);
}

function expectErr(value: unknown, key: string): void {
  expect(variantKey(value)).toBe("err");
  expect(variantKey((value as { err: unknown }).err)).toBe(key);
}

function bytes(value: Uint8Array | number[] | ArrayBuffer): number[] {
  return Array.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
}
