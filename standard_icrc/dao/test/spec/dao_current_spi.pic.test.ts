import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  Principal,
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import { balanceOf } from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  accountFor,
  approveAndDeposit,
  callerPrincipal,
  type DaoE2E,
  setupDaoE2E,
  UNSTAKE_DELAY_SECONDS,
} from "./daoTestEnv.ts";

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

describe("current DAO SPI surface", () => {
  let env: DaoE2E | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("SPI-103 deposit credits SPI-101 wallet and SPI-102 discovery explains the graph", async () => {
    env = await setupDaoE2E();
    const account = accountFor(callerPrincipal(env.alice), 1n);

    const encoded = await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_100_account(callerPrincipal(env.alice), 1n),
    );
    expect(bytes(encoded[0])).toEqual(bytes(account));

    const receipt = unwrapOk<any>(
      await approveAndDeposit(env, env.alice, account, 1_000_000n),
    );
    expect(receipt.ledger.toText()).toBe(env.ledger.canisterId.toText());
    expect(receipt.amount).toBe(1_000_000n);
    expect(receipt.balanceAfter).toBe(1_000_000n);

    const wallet = unwrapOk<WalletReceipt>(await daoWallet(env, account));
    expect(bytes(wallet.account)).toEqual(bytes(account));
    expect(walletNodeAmount(wallet, ledgerNode(env.ledger.canisterId))).toBe(
      1_000_000n,
    );

    const discovery = await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    expect(bytes(discovery.account)).toEqual(bytes(account));
    expect(discovery.nodes).toHaveLength(3);
    expect(discovery.edges).toHaveLength(4);
    expectEdgesExplainNodes(discovery);
    expect(edgeByNamespace(discovery, "stake").edge.inputNodes).toEqual([
      ledgerNode(env.ledger.canisterId),
    ]);
    expect(statusKey(edgeByNamespace(discovery, "stake").status)).toBe("live");
    expect(statusKey(edgeByNamespace(discovery, "request-unstake").status)).toBe(
      "insufficientInput",
    );
  });

  test("SPI-102 stake, pending unstake, cancel, and mature claim are account safe", async () => {
    env = await setupDaoE2E();
    const account = accountFor(callerPrincipal(env.alice), 2n);
    await approveAndDeposit(env, env.alice, account, 1_000n);

    const initial = await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    const stake = edgeByNamespace(initial, "stake");
    const stakeQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, stake.edge.edgeId, 600n)),
      ),
    );
    expect(stakeQuote.input).toEqual([
      { node: ledgerNode(env.ledger.canisterId), amount: 600n },
    ]);
    expectErr(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(
          executeRequest(stakeQuote, {
            minReceive: [{ node: stake.edge.outputNodes[0], amount: 601n }],
          }),
        ),
      ),
      "guardRejected",
    );
    unwrapOk(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(stakeQuote)),
      ),
    );
    expect(await env.dao.actor.state(account)).toMatchObject({
      liquid: 400n,
      active: 600n,
      pendingUnstake: 0n,
    });

    const afterStake = await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    const requestUnstake = edgeByNamespace(afterStake, "request-unstake");
    const pendingNode = requestUnstake.edge.outputNodes[0];
    const requestQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(
          quoteRequest(account, requestUnstake.edge.edgeId, 250n),
        ),
      ),
    );
    unwrapOk(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(requestQuote)),
      ),
    );
    const pendingState = await env.dao.actor.state(account);
    expect(pendingState.active).toBe(350n);
    expect(pendingState.pendingUnstake).toBe(250n);
    expect(pendingState.unlockAt).toBeGreaterThan(0n);
    expect(walletNodeAmount(unwrapOk(await daoWallet(env, account)), pendingNode))
      .toBe(250n);
    expect(walletStatusKey(unwrapOk(await daoWallet(env, account)), pendingNode))
      .toBe("locked");

    const pendingDiscovery = await env.runtime.callAs(
      env.dao.actor,
      env.alice,
      (actor) => actor.spi_102_discover(discoverRequest(account)),
    );
    const immatureClaim = edgeByNamespace(pendingDiscovery, "claim-unstaked");
    expect(statusKey(immatureClaim.status)).toBe("notMature");
    const immatureClaimQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, immatureClaim.edge.edgeId, 100n)),
      ),
    );
    expectErr(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(immatureClaimQuote)),
      ),
      "edgeNotLive",
    );

    const cancel = edgeByNamespace(pendingDiscovery, "cancel-unstake");
    const cancelQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, cancel.edge.edgeId, 50n)),
      ),
    );
    unwrapOk(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(cancelQuote)),
      ),
    );
    expect(await env.dao.actor.state(account)).toMatchObject({
      liquid: 400n,
      active: 400n,
      pendingUnstake: 200n,
    });

    await env.runtime.advanceSeconds(UNSTAKE_DELAY_SECONDS + 1);
    const matured = await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    const claim = edgeByNamespace(matured, "claim-unstaked");
    expect(statusKey(claim.status)).toBe("live");
    const claimQuote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, claim.edge.edgeId, 200n)),
      ),
    );
    unwrapOk(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(claimQuote)),
      ),
    );
    expect(await env.dao.actor.state(account)).toEqual({
      liquid: 600n,
      active: 400n,
      pendingUnstake: 0n,
      unlockAt: 0n,
      pendingWithdrawDebit: 0n,
    });
  });

  test("SPI-103 withdraw debits local balance plus fee and moves ICRC tokens", async () => {
    env = await setupDaoE2E();
    const account = accountFor(callerPrincipal(env.alice), 3n);
    await approveAndDeposit(env, env.alice, account, 100_000n);

    const bobBefore = await balanceOf(env.ledger, env.bob);
    const result = unwrapOk<any>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_103_icrc_withdraw({
          account,
          ledger: env.ledger.canisterId,
          to: icrcAccount(callerPrincipal(env.bob)),
          amount: 25_000n,
        }),
      ),
    );
    expect(result.amount).toBe(25_000n);
    expect(result.fee).toBe(env.ledger.fee);
    expect(result.debitAmount).toBe(25_000n + env.ledger.fee);
    expect(result.balanceAfter).toBe(100_000n - 25_000n - env.ledger.fee);
    expect(await balanceOf(env.ledger, env.bob)).toBe(bobBefore + 25_000n);
    expect(
      walletNodeAmount(
        unwrapOk(await daoWallet(env, account)),
        ledgerNode(env.ledger.canisterId),
      ),
    ).toBe(100_000n - 25_000n - env.ledger.fee);
  });

  test("authorization, invalid amount, and quote expiry are rejected without mutation", async () => {
    env = await setupDaoE2E();
    const account = accountFor(callerPrincipal(env.alice), 4n);
    await approveAndDeposit(env, env.alice, account, 500n);

    const bobDiscovery = await env.runtime.callAs(env.dao.actor, env.bob, (actor) =>
      actor.spi_102_discover(discoverRequest(account)),
    );
    for (const edge of bobDiscovery.edges) {
      expect(statusKey(edge.status)).toBe("unauthorized");
    }
    expectErr(
      await env.runtime.callAs(env.dao.actor, env.bob, (actor) =>
        actor.spi_101_wallet(walletRequest(account)),
      ),
      "accountNotAuthorized",
    );

    const aliceDiscovery = await env.runtime.callAs(
      env.dao.actor,
      env.alice,
      (actor) => actor.spi_102_discover(discoverRequest(account)),
    );
    const stake = edgeByNamespace(aliceDiscovery, "stake");
    expectErr(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, stake.edge.edgeId, 0n)),
      ),
      "invalidAmount",
    );
    const quote = unwrapOk<Quote>(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_quote(quoteRequest(account, stake.edge.edgeId, 100n)),
      ),
    );
    expectErr(
      await env.runtime.callAs(env.dao.actor, env.bob, (actor) =>
        actor.spi_102_execute(executeRequest(quote)),
      ),
      "accountNotAuthorized",
    );
    await env.runtime.advanceSeconds(301);
    expectErr(
      await env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
        actor.spi_102_execute(executeRequest(quote)),
      ),
      "expiredQuote",
    );
    expect(await env.dao.actor.state(account)).toMatchObject({
      liquid: 500n,
      active: 0n,
      pendingUnstake: 0n,
    });
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

function quoteRequest(account: Uint8Array, edgeId: EdgeId, amount: bigint) {
  return {
    account,
    edgeId,
    intent: { amount, positionId: [], extension: [] },
  };
}

function executeRequest(
  quote: Quote,
  guard: Partial<{
    minReceive: BasketEntry[];
    maxSpend: BasketEntry[];
    deadline: Opt<bigint>;
    maxFee: BasketEntry[];
  }> = {},
) {
  return {
    quote,
    guard: {
      minReceive: guard.minReceive ?? [],
      maxSpend: guard.maxSpend ?? [],
      deadline: guard.deadline ?? [],
      maxFee: guard.maxFee ?? [],
      maxPriceImpact: [],
      minShares: [],
      maxDebt: [],
      minHealth: [],
      extension: [],
    },
  };
}

async function daoWallet(env: DaoE2E, account: Uint8Array): Promise<unknown> {
  return env.runtime.callAs(env.dao.actor, env.alice, (actor) =>
    actor.spi_101_wallet(walletRequest(account)),
  );
}

function icrcAccount(owner: Principal): IcrcAccount {
  return {
    owner,
    subaccount: [],
  };
}

function ledgerNode(ledger: Principal): NodeId {
  return { ledger };
}

function statusKey(status: unknown): string {
  return variantKey(status);
}

function edgeByNamespace(discovery: any, namespace: string): any {
  const found = discovery.edges.find(
    (entry: any) => entry.edge.edgeId.namespace === namespace,
  );
  if (found === undefined) {
    throw new Error(`missing edge ${namespace}`);
  }
  return found;
}

function expectEdgesExplainNodes(discovery: any): void {
  const nodeKeys = new Set(discovery.nodes.map((node: any) => nodeKey(node.nodeId)));
  for (const entry of discovery.edges) {
    for (const node of [...entry.edge.inputNodes, ...entry.edge.outputNodes]) {
      expect(nodeKeys.has(nodeKey(node))).toBe(true);
    }
  }
}

function walletNodeAmount(receipt: WalletReceipt, node: NodeId): bigint {
  const found = receipt.entries.find((entry) => nodeKey(entry.node) === nodeKey(node));
  if (found === undefined) {
    return 0n;
  }
  expect(variantKey(found.holding)).toBe("fungible");
  return (found.holding as { fungible: { amount: bigint } }).fungible.amount;
}

function walletStatusKey(receipt: WalletReceipt, node: NodeId): string {
  const found = receipt.entries.find((entry) => nodeKey(entry.node) === nodeKey(node));
  if (found === undefined) {
    throw new Error(`wallet is missing node ${nodeKey(node)}`);
  }
  return variantKey(found.status);
}

function expectErr(value: unknown, key: string): void {
  expect(variantKey(value)).toBe("err");
  expect(variantKey((value as { err: unknown }).err)).toBe(key);
}

function nodeKey(node: NodeId): string {
  if ("ledger" in node) {
    return `ledger:${node.ledger.toText()}`;
  }
  return `local:${bytes(node.local).join(",")}`;
}

function bytes(value: Uint8Array | number[] | ArrayBuffer | undefined): number[] {
  if (value === undefined) {
    return [];
  }
  return Array.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
}
