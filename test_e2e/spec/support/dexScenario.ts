import { expect } from "bun:test";
import {
  createTestRuntime,
  ledgerKey,
  poolKey,
  principalOf,
  testIdentity,
  type Caller,
  type Principal,
  type TestIdentity,
  type TestRuntime,
  unwrapOk,
  variantKey,
} from "../../common/runtime.ts";
import {
  deployDex,
  type DexFixture,
} from "../../fixtures/actors/dex/dexHarness.ts";
import {
  approve,
  balanceOf,
  deployIcrcLedger,
  mint,
  type IcrcLedgerFixture,
} from "../../fixtures/icrc_ledger/ledgerHarness.ts";

export type DexLedger = IcrcLedgerFixture & {
  index: number;
  key: string;
};

export type PoolModel = {
  id: bigint;
  key: string;
  ledgerA: Principal;
  ledgerB: Principal;
  reserveA: bigint;
  reserveB: bigint;
  totalShares: bigint;
  lockedShares: bigint;
};

export type CreateDexScenarioOptions = {
  name: string;
  ledgerCount?: number;
  userCount?: number;
  initialExternalBalance?: bigint;
  ledgerFee?: bigint;
};

export type ActionCheckOptions = {
  checkExternal?: boolean;
  checkAll?: boolean;
};

export type DexScenario = {
  runtime: TestRuntime<readonly ["controller"]>;
  controller: TestIdentity;
  users: TestIdentity[];
  dex: DexFixture;
  ledgers: DexLedger[];
  model: DexModel;
  tearDown(): Promise<void>;
  whitelistLedger(ledger: number | DexLedger, caller?: Caller): Promise<unknown>;
  whitelistAll(caller?: Caller): Promise<void>;
  retireLedger(ledger: number | DexLedger, caller?: Caller): Promise<unknown>;
  removeLedger(ledger: number | DexLedger, caller?: Caller): Promise<unknown>;
  createPool(
    ledgerA: number | DexLedger,
    ledgerB: number | DexLedger,
    caller?: Caller,
  ): Promise<unknown>;
  removePool(
    ledgerA: number | DexLedger,
    ledgerB: number | DexLedger,
    caller?: Caller,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  fund(user: number | Caller, ledger: number | DexLedger, amount: bigint): Promise<void>;
  deposit(
    user: number | Caller,
    ledger: number | DexLedger,
    amount: bigint,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  approveAndDeposit(
    user: number | Caller,
    ledger: number | DexLedger,
    amount: bigint,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  withdraw(
    user: number | Caller,
    ledger: number | DexLedger,
    amount: bigint,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  quote(
    ledgerIn: number | DexLedger,
    ledgerOut: number | DexLedger,
    amountIn: bigint,
    minAmountOut?: bigint,
  ): Promise<unknown>;
  swap(
    user: number | Caller,
    ledgerIn: number | DexLedger,
    ledgerOut: number | DexLedger,
    amountIn: bigint,
    minAmountOut?: bigint,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  addLiquidity(
    user: number | Caller,
    ledgerA: number | DexLedger,
    ledgerB: number | DexLedger,
    maxAmountA: bigint,
    maxAmountB: bigint,
    minShares?: bigint,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  removeLiquidity(
    user: number | Caller,
    ledgerA: number | DexLedger,
    ledgerB: number | DexLedger,
    shares: bigint,
    minAmountA?: bigint,
    minAmountB?: bigint,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  returnLedgerBalances(
    ledger: number | DexLedger,
    caller?: Caller,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  abandonDust(
    user: number | Caller,
    ledger: number | DexLedger,
    opts?: ActionCheckOptions,
  ): Promise<unknown>;
  assertUser(user: number | Caller): Promise<void>;
  assertPool(ledgerA: number | DexLedger, ledgerB: number | DexLedger): Promise<void>;
  assertPools(): Promise<void>;
  assertLedgerObligation(ledger: number | DexLedger): Promise<void>;
  assertAll(opts?: { external?: boolean }): Promise<void>;
};

export class DexModel {
  readonly balances = new Map<string, bigint>();
  readonly pools = new Map<string, PoolModel>();
  readonly abandonedDust = new Map<string, bigint>();
  readonly activeLedgers = new Set<string>();
  readonly retiringLedgers = new Set<string>();
  readonly seenBalanceRecords = new Set<string>();
  readonly holderLog: Array<{ user: Principal; key: string }> = [];

  constructor(readonly controller: Principal) {}

  balance(user: Principal, key: string): bigint {
    return this.balances.get(recordKey(user, key)) ?? 0n;
  }

  total(key: string): bigint {
    let total = 0n;
    for (const [record, amount] of this.balances) {
      if (record.endsWith(`:${key}`)) {
        total += amount;
      }
    }
    return total;
  }

  credit(user: Principal, key: string, amount: bigint): void {
    if (amount === 0n) {
      return;
    }
    const record = recordKey(user, key);
    this.balances.set(record, (this.balances.get(record) ?? 0n) + amount);
    if (!this.seenBalanceRecords.has(record)) {
      this.seenBalanceRecords.add(record);
      this.holderLog.push({ user, key });
    }
  }

  debit(user: Principal, key: string, amount: bigint): void {
    if (amount === 0n) {
      return;
    }
    const record = recordKey(user, key);
    const before = this.balances.get(record) ?? 0n;
    if (before < amount) {
      throw new Error(`model insufficient balance for ${record}: ${before} < ${amount}`);
    }
    this.balances.set(record, before - amount);
  }

  entries(user: Principal): Array<[string, bigint]> {
    const out: Array<[string, bigint]> = [];
    for (const item of this.holderLog) {
      if (item.user.toText() !== user.toText()) {
        continue;
      }
      const amount = this.balance(user, item.key);
      if (amount > 0n) {
        out.push([item.key, amount]);
      }
    }
    return sortEntries(out);
  }

  holders(key: string): Principal[] {
    const out: Principal[] = [];
    for (const item of this.holderLog) {
      if (item.key === key && this.balance(item.user, key) > 0n) {
        out.push(item.user);
      }
    }
    return out;
  }

  firstNonControllerHolderAbove(key: string, amount: bigint): Principal | undefined {
    for (const holder of this.holders(key)) {
      if (
        holder.toText() !== this.controller.toText() &&
        this.balance(holder, key) > amount
      ) {
        return holder;
      }
    }
    return undefined;
  }

  reserveTotal(ledger: Principal): bigint {
    let total = 0n;
    for (const pool of this.pools.values()) {
      if (pool.ledgerA.toText() === ledger.toText()) {
        total += pool.reserveA;
      }
      if (pool.ledgerB.toText() === ledger.toText()) {
        total += pool.reserveB;
      }
    }
    return total;
  }

  abandoned(ledger: Principal): bigint {
    return this.abandonedDust.get(ledgerKey(ledger)) ?? 0n;
  }

  ledgerObligation(ledger: Principal): bigint {
    const key = ledgerKey(ledger);
    return this.total(key) + this.reserveTotal(ledger) + this.abandoned(ledger);
  }
}

export async function createDexScenario(
  opts: CreateDexScenarioOptions,
): Promise<DexScenario> {
  const ledgerCount = opts.ledgerCount ?? 2;
  const userCount = opts.userCount ?? 3;
  const initialExternalBalance = opts.initialExternalBalance ?? 20_000_000_000n;
  const ledgerFee = opts.ledgerFee ?? 10_000n;

  const runtime = await createTestRuntime({
    identities: ["controller"] as const,
    identityPrefix: `dex-${opts.name}`,
  });
  const controller = runtime.identities.controller;
  const dex = await deployDex(runtime.pic, controller.getPrincipal());
  const users = Array.from({ length: userCount }, (_, i) =>
    testIdentity(`${opts.name}-user-${i}`),
  );
  const model = new DexModel(controller.getPrincipal());
  const ledgers: DexLedger[] = [];

  for (let i = 0; i < ledgerCount; i += 1) {
    const ledger = await deployIcrcLedger(runtime.pic, {
      controller,
      symbol: `T${i}`,
      name: `Token ${i}`,
      fee: ledgerFee,
      mintingAccount: runtime.account(controller, runtime.subaccount(1_000_000n + BigInt(i))),
    });
    const dexLedger = {
      ...ledger,
      index: i,
      key: ledgerKey(ledger.canisterId),
    };
    ledgers.push(dexLedger);
    if (initialExternalBalance > 0n) {
      for (const user of users) {
        await mint(dexLedger, user, initialExternalBalance, { minter: controller });
      }
    }
  }

  const scenario: DexScenario = {
    runtime,
    controller,
    users,
    dex,
    ledgers,
    model,
    async tearDown(): Promise<void> {
      await runtime.tearDown();
    },
    async whitelistLedger(ledgerRef, caller = controller): Promise<unknown> {
      const ledger = resolveLedger(ledgers, ledgerRef);
      runtime.as(dex.actor, caller);
      const result = await dex.actor.controller_ledger({ add: ledger.canisterId });
      if (hasVariant(result, "ok")) {
        model.activeLedgers.add(ledger.canisterId.toText());
        model.retiringLedgers.delete(ledger.canisterId.toText());
      }
      return result;
    },
    async whitelistAll(caller = controller): Promise<void> {
      for (const ledger of ledgers) {
        unwrapOk(await scenario.whitelistLedger(ledger, caller));
      }
    },
    async retireLedger(ledgerRef, caller = controller): Promise<unknown> {
      const ledger = resolveLedger(ledgers, ledgerRef);
      runtime.as(dex.actor, caller);
      const result = await dex.actor.controller_ledger({ retire: ledger.canisterId });
      if (hasVariant(result, "ok")) {
        model.activeLedgers.delete(ledger.canisterId.toText());
        model.retiringLedgers.add(ledger.canisterId.toText());
      }
      return result;
    },
    async removeLedger(ledgerRef, caller = controller): Promise<unknown> {
      const ledger = resolveLedger(ledgers, ledgerRef);
      runtime.as(dex.actor, caller);
      const result = await dex.actor.controller_ledger({ rem: ledger.canisterId });
      if (hasVariant(result, "ok")) {
        model.activeLedgers.delete(ledger.canisterId.toText());
        model.retiringLedgers.delete(ledger.canisterId.toText());
      }
      return result;
    },
    async createPool(ledgerARef, ledgerBRef, caller = controller): Promise<unknown> {
      const ledgerA = resolveLedger(ledgers, ledgerARef);
      const ledgerB = resolveLedger(ledgers, ledgerBRef);
      runtime.as(dex.actor, caller);
      const result = await dex.actor.createPool(ledgerA.canisterId, ledgerB.canisterId);
      if (hasVariant(result, "ok")) {
        const info = result.ok as PoolInfoLike;
        model.pools.set(info.key, {
          id: info.id,
          key: info.key,
          ledgerA: info.ledgerA,
          ledgerB: info.ledgerB,
          reserveA: info.reserveA,
          reserveB: info.reserveB,
          totalShares: info.totalShares,
          lockedShares: info.lockedShares,
        });
      }
      return result;
    },
    async removePool(ledgerARef, ledgerBRef, caller = controller, checkOpts = {}): Promise<unknown> {
      const ledgerA = resolveLedger(ledgers, ledgerARef);
      const ledgerB = resolveLedger(ledgers, ledgerBRef);
      const key = poolKey(ledgerA.canisterId, ledgerB.canisterId);
      const previousHolders = model.holders(key);
      runtime.as(dex.actor, caller);
      const result = await dex.actor.removePool(ledgerA.canisterId, ledgerB.canisterId);
      if (hasVariant(result, "ok")) {
        modelRemovePool(model, key);
      }
      await assertAfter(scenario, {
        users: previousHolders.concat([controller.getPrincipal()]),
        ledgers: [ledgerA, ledgerB],
        pools: [],
        checkExternal: checkOpts.checkExternal,
        checkAll: checkOpts.checkAll,
      });
      return result;
    },
    async fund(userRef, ledgerRef, amount): Promise<void> {
      const user = resolveCaller(users, userRef);
      const ledger = resolveLedger(ledgers, ledgerRef);
      await mint(ledger, user, amount, { minter: controller });
    },
    async deposit(userRef, ledgerRef, amount, checkOpts = {}): Promise<unknown> {
      const user = resolveCaller(users, userRef);
      const ledger = resolveLedger(ledgers, ledgerRef);
      runtime.as(dex.actor, user);
      const result = await dex.actor.deposit(ledger.canisterId, amount);
      if (hasVariant(result, "ok")) {
        model.credit(principalOf(user), ledger.key, amount);
      }
      await assertAfter(scenario, {
        users: [principalOf(user)],
        ledgers: [ledger],
        checkExternal: checkOpts.checkExternal,
        checkAll: checkOpts.checkAll,
      });
      return result;
    },
    async approveAndDeposit(userRef, ledgerRef, amount, checkOpts = {}): Promise<unknown> {
      const user = resolveCaller(users, userRef);
      const ledger = resolveLedger(ledgers, ledgerRef);
      await approve(ledger, user, dex.canisterId, amount + ledger.fee);
      return scenario.deposit(user, ledger, amount, checkOpts);
    },
    async withdraw(userRef, ledgerRef, amount, checkOpts = {}): Promise<unknown> {
      const user = resolveCaller(users, userRef);
      const ledger = resolveLedger(ledgers, ledgerRef);
      runtime.as(dex.actor, user);
      const result = await dex.actor.withdraw(ledger.canisterId, amount);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as WithdrawReceiptLike;
        model.debit(principalOf(user), ledger.key, receipt.debitAmount);
      }
      await assertAfter(scenario, {
        users: [principalOf(user)],
        ledgers: [ledger],
        checkExternal: checkOpts.checkExternal,
        checkAll: checkOpts.checkAll,
      });
      return result;
    },
    async quote(ledgerInRef, ledgerOutRef, amountIn, minAmountOut = 0n): Promise<unknown> {
      const ledgerIn = resolveLedger(ledgers, ledgerInRef);
      const ledgerOut = resolveLedger(ledgers, ledgerOutRef);
      return dex.actor.quote(ledgerIn.canisterId, ledgerOut.canisterId, amountIn, minAmountOut);
    },
    async swap(userRef, ledgerInRef, ledgerOutRef, amountIn, minAmountOut = 0n, checkOpts = {}): Promise<unknown> {
      const user = resolveCaller(users, userRef);
      const ledgerIn = resolveLedger(ledgers, ledgerInRef);
      const ledgerOut = resolveLedger(ledgers, ledgerOutRef);
      runtime.as(dex.actor, user);
      const result = await dex.actor.swap(
        ledgerIn.canisterId,
        ledgerOut.canisterId,
        amountIn,
        minAmountOut,
      );
      if (hasVariant(result, "ok")) {
        modelSwap(model, principalOf(user), result.ok as SwapReceiptLike);
      }
      await assertAfter(scenario, {
        users: [principalOf(user), controller.getPrincipal()],
        ledgers: [ledgerIn, ledgerOut],
        pools: [poolKey(ledgerIn.canisterId, ledgerOut.canisterId)],
        checkExternal: checkOpts.checkExternal,
        checkAll: checkOpts.checkAll,
      });
      return result;
    },
    async addLiquidity(userRef, ledgerARef, ledgerBRef, maxAmountA, maxAmountB, minShares = 0n, checkOpts = {}): Promise<unknown> {
      const user = resolveCaller(users, userRef);
      const ledgerA = resolveLedger(ledgers, ledgerARef);
      const ledgerB = resolveLedger(ledgers, ledgerBRef);
      runtime.as(dex.actor, user);
      const result = await dex.actor.liquidity({
        add: {
          ledgerA: ledgerA.canisterId,
          ledgerB: ledgerB.canisterId,
          maxAmountA,
          maxAmountB,
          minShares,
        },
      });
      if (hasVariant(result, "ok") && hasVariant(result.ok, "added")) {
        modelAddLiquidity(model, principalOf(user), result.ok.added as AddReceiptLike);
      }
      await assertAfter(scenario, {
        users: [principalOf(user)],
        ledgers: [ledgerA, ledgerB],
        pools: [poolKey(ledgerA.canisterId, ledgerB.canisterId)],
        checkExternal: checkOpts.checkExternal,
        checkAll: checkOpts.checkAll,
      });
      return result;
    },
    async removeLiquidity(userRef, ledgerARef, ledgerBRef, shares, minAmountA = 0n, minAmountB = 0n, checkOpts = {}): Promise<unknown> {
      const user = resolveCaller(users, userRef);
      const ledgerA = resolveLedger(ledgers, ledgerARef);
      const ledgerB = resolveLedger(ledgers, ledgerBRef);
      runtime.as(dex.actor, user);
      const result = await dex.actor.liquidity({
        rem: {
          ledgerA: ledgerA.canisterId,
          ledgerB: ledgerB.canisterId,
          shares,
          minAmountA,
          minAmountB,
        },
      });
      if (hasVariant(result, "ok") && hasVariant(result.ok, "removed")) {
        modelRemoveLiquidity(model, principalOf(user), result.ok.removed as RemoveReceiptLike);
      }
      await assertAfter(scenario, {
        users: [principalOf(user)],
        ledgers: [ledgerA, ledgerB],
        pools: [poolKey(ledgerA.canisterId, ledgerB.canisterId)],
        checkExternal: checkOpts.checkExternal,
        checkAll: checkOpts.checkAll,
      });
      return result;
    },
    async returnLedgerBalances(ledgerRef, caller = controller, checkOpts = {}): Promise<unknown> {
      const ledger = resolveLedger(ledgers, ledgerRef);
      const previousHolders = model.holders(ledger.key);
      runtime.as(dex.actor, caller);
      const result = await dex.actor.returnLedgerBalances(ledger.canisterId);
      let returnedUser: Principal | undefined;
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as ReturnReceiptLike;
        if (receipt.returnedUser.length === 1) {
          returnedUser = receipt.returnedUser[0];
          model.debit(returnedUser, ledger.key, receipt.localBalance);
        }
      }
      await assertAfter(scenario, {
        users: previousHolders.concat(returnedUser === undefined ? [] : [returnedUser]),
        ledgers: [ledger],
        checkExternal: checkOpts.checkExternal,
        checkAll: checkOpts.checkAll,
      });
      return result;
    },
    async abandonDust(userRef, ledgerRef, checkOpts = {}): Promise<unknown> {
      const user = resolveCaller(users, userRef);
      const ledger = resolveLedger(ledgers, ledgerRef);
      runtime.as(dex.actor, user);
      const result = await dex.actor.abandonDust(ledger.canisterId);
      if (hasVariant(result, "ok")) {
        const receipt = result.ok as DustReceiptLike;
        model.debit(principalOf(user), ledger.key, receipt.abandonedAmount);
        model.abandonedDust.set(
          ledger.key,
          (model.abandonedDust.get(ledger.key) ?? 0n) + receipt.abandonedAmount,
        );
      }
      await assertAfter(scenario, {
        users: [principalOf(user)],
        ledgers: [ledger],
        checkExternal: checkOpts.checkExternal,
        checkAll: checkOpts.checkAll,
      });
      return result;
    },
    async assertUser(userRef): Promise<void> {
      await assertUserBalances(scenario, principalOf(resolveCaller(users, userRef)));
    },
    async assertPool(ledgerARef, ledgerBRef): Promise<void> {
      const ledgerA = resolveLedger(ledgers, ledgerARef);
      const ledgerB = resolveLedger(ledgers, ledgerBRef);
      await assertOnePool(scenario, poolKey(ledgerA.canisterId, ledgerB.canisterId));
    },
    async assertPools(): Promise<void> {
      await assertPools(scenario);
    },
    async assertLedgerObligation(ledgerRef): Promise<void> {
      const ledger = resolveLedger(ledgers, ledgerRef);
      await assertLedgerObligation(scenario, ledger);
    },
    async assertAll(assertOpts = {}): Promise<void> {
      await assertAll(scenario, assertOpts);
    },
  };

  return scenario;
}

export function expectOk<T = unknown>(result: unknown): T {
  return unwrapOk<T>(result);
}

export function expectErr(result: unknown, key?: string): unknown {
  expect(hasVariant(result, "err")).toBe(true);
  const err = (result as { err: unknown }).err;
  if (key !== undefined) {
    expect(variantKey(err)).toBe(key);
  }
  return err;
}

export function hasVariant(value: unknown, key: string): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

export function splitFees(amountIn: bigint): {
  fee: bigint;
  platformFee: bigint;
  lpFee: bigint;
  effectiveAmountIn: bigint;
} {
  const fee = (amountIn * 3n) / 1000n;
  const platformFee = (fee * 20n) / 100n;
  const lpFee = fee - platformFee;
  return {
    fee,
    platformFee,
    lpFee,
    effectiveAmountIn: amountIn - fee,
  };
}

export function quoteExactIn(
  reserveIn: bigint,
  reserveOut: bigint,
  effectiveAmountIn: bigint,
): bigint {
  if (reserveIn === 0n || reserveOut === 0n || effectiveAmountIn === 0n) {
    return 0n;
  }
  return (reserveOut * effectiveAmountIn) / (reserveIn + effectiveAmountIn);
}

export function deterministicAmount(seed: number, min: bigint, spread: bigint): bigint {
  return min + (BigInt(seed >>> 0) % spread);
}

export function applySwapReceiptToModel(
  scenario: DexScenario,
  user: Caller,
  receipt: SwapReceiptLike,
): void {
  modelSwap(scenario.model, principalOf(user), receipt);
}

export function applyAddReceiptToModel(
  scenario: DexScenario,
  user: Caller,
  receipt: AddReceiptLike,
): void {
  modelAddLiquidity(scenario.model, principalOf(user), receipt);
}

export function applyRemoveReceiptToModel(
  scenario: DexScenario,
  user: Caller,
  receipt: RemoveReceiptLike,
): void {
  modelRemoveLiquidity(scenario.model, principalOf(user), receipt);
}

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  int(maxExclusive: number): number {
    return this.next() % maxExclusive;
  }

  amount(min: bigint, maxExclusive: bigint): bigint {
    return min + (BigInt(this.next()) % (maxExclusive - min));
  }
}

async function assertAfter(
  scenario: DexScenario,
  opts: {
    users?: Principal[];
    ledgers?: DexLedger[];
    pools?: string[];
    checkExternal?: boolean;
    checkAll?: boolean;
  },
): Promise<void> {
  if (opts.checkAll === true) {
    await assertAll(scenario, { external: opts.checkExternal ?? true });
    return;
  }
  const userTexts = new Set<string>();
  for (const user of opts.users ?? []) {
    if (!userTexts.has(user.toText())) {
      userTexts.add(user.toText());
      await assertUserBalances(scenario, user);
    }
  }
  for (const key of opts.pools ?? []) {
    await assertOnePool(scenario, key);
  }
  if (opts.checkExternal !== false) {
    for (const ledger of opts.ledgers ?? []) {
      await assertLedgerObligation(scenario, ledger);
    }
  }
}

async function assertAll(
  scenario: DexScenario,
  opts: { external?: boolean } = {},
): Promise<void> {
  const principals = new Set<string>([scenario.controller.getPrincipal().toText()]);
  for (const item of scenario.model.holderLog) {
    principals.add(item.user.toText());
  }
  for (const text of principals) {
    const user = scenario.model.holderLog.find((item) => item.user.toText() === text)?.user;
    await assertUserBalances(
      scenario,
      user ?? scenario.controller.getPrincipal(),
    );
  }
  await assertPools(scenario);
  if (opts.external !== false) {
    for (const ledger of scenario.ledgers) {
      await assertLedgerObligation(scenario, ledger);
    }
  }
}

async function assertUserBalances(
  scenario: DexScenario,
  user: Principal,
): Promise<void> {
  const actual = sortEntries(await scenario.dex.actor.balances(user));
  const expected = scenario.model.entries(user);
  expect(actual).toEqual(expected);
}

async function assertPools(scenario: DexScenario): Promise<void> {
  const actual = ((await scenario.dex.actor.pools()) as PoolInfoLike[])
    .map(normalizePoolInfo)
    .sort((a, b) => a.key.localeCompare(b.key));
  const expected = [...scenario.model.pools.values()]
    .map(poolToInfo)
    .sort((a, b) => a.key.localeCompare(b.key));
  expect(actual).toEqual(expected);
}

async function assertOnePool(scenario: DexScenario, key: string): Promise<void> {
  const actual = ((await scenario.dex.actor.pools()) as PoolInfoLike[])
    .map(normalizePoolInfo)
    .find((pool) => pool.key === key);
  const expected = scenario.model.pools.get(key);
  if (expected === undefined) {
    expect(actual).toBeUndefined();
  } else {
    expect(actual).toEqual(poolToInfo(expected));
  }
}

async function assertLedgerObligation(
  scenario: DexScenario,
  ledger: DexLedger,
): Promise<void> {
  const actual = await balanceOf(ledger, scenario.dex.canisterId);
  expect(actual).toBe(scenario.model.ledgerObligation(ledger.canisterId));
}

function modelSwap(model: DexModel, user: Principal, receipt: SwapReceiptLike): void {
  const pool = mustPool(model, poolKey(receipt.ledgerIn, receipt.ledgerOut));
  const inKey = ledgerKey(receipt.ledgerIn);
  const outKey = ledgerKey(receipt.ledgerOut);
  model.debit(user, inKey, receipt.amountIn);
  model.credit(user, outKey, receipt.amountOut);
  model.credit(model.controller, inKey, receipt.platformFee);
  if (pool.ledgerA.toText() === receipt.ledgerIn.toText()) {
    pool.reserveA = receipt.reserveInAfter;
    pool.reserveB = receipt.reserveOutAfter;
  } else {
    pool.reserveB = receipt.reserveInAfter;
    pool.reserveA = receipt.reserveOutAfter;
  }
}

function modelAddLiquidity(
  model: DexModel,
  user: Principal,
  receipt: AddReceiptLike,
): void {
  const pool = mustPool(model, receipt.poolKey);
  model.debit(user, ledgerKey(receipt.ledgerA), receipt.usedA);
  model.debit(user, ledgerKey(receipt.ledgerB), receipt.usedB);
  model.credit(user, receipt.poolKey, receipt.shares);
  pool.reserveA += receipt.usedA;
  pool.reserveB += receipt.usedB;
  pool.totalShares += receipt.shares + receipt.lockedShares;
  pool.lockedShares += receipt.lockedShares;
}

function modelRemoveLiquidity(
  model: DexModel,
  user: Principal,
  receipt: RemoveReceiptLike,
): void {
  const pool = mustPool(model, receipt.poolKey);
  model.debit(user, receipt.poolKey, receipt.shares);
  model.credit(user, ledgerKey(receipt.ledgerA), receipt.amountA);
  model.credit(user, ledgerKey(receipt.ledgerB), receipt.amountB);
  pool.reserveA -= receipt.amountA;
  pool.reserveB -= receipt.amountB;
  pool.totalShares -= receipt.shares;
}

function modelRemovePool(model: DexModel, key: string): void {
  const pool = mustPool(model, key);
  const holders = model.holders(key);
  let remainingA = pool.reserveA;
  let remainingB = pool.reserveB;
  let remainingShares = pool.totalShares;
  for (let i = 0; i < holders.length; i += 1) {
    const user = holders[i];
    const shares = model.balance(user, key);
    if (shares === 0n || shares > remainingShares || remainingShares === 0n) {
      continue;
    }
    const lastUser = i + 1 === holders.length && pool.lockedShares === 0n;
    const amountA = lastUser ? remainingA : (shares * remainingA) / remainingShares;
    const amountB = lastUser ? remainingB : (shares * remainingB) / remainingShares;
    model.debit(user, key, shares);
    model.credit(user, ledgerKey(pool.ledgerA), amountA);
    model.credit(user, ledgerKey(pool.ledgerB), amountB);
    remainingA -= amountA;
    remainingB -= amountB;
    remainingShares -= shares;
  }
  if (pool.lockedShares > 0n) {
    model.credit(model.controller, ledgerKey(pool.ledgerA), remainingA);
    model.credit(model.controller, ledgerKey(pool.ledgerB), remainingB);
  }
  model.pools.delete(key);
}

function mustPool(model: DexModel, key: string): PoolModel {
  const pool = model.pools.get(key);
  if (pool === undefined) {
    throw new Error(`missing model pool ${key}`);
  }
  return pool;
}

function resolveLedger(ledgers: DexLedger[], ref: number | DexLedger): DexLedger {
  if (typeof ref === "number") {
    const ledger = ledgers[ref];
    if (ledger === undefined) {
      throw new Error(`no ledger at index ${ref}`);
    }
    return ledger;
  }
  return ref;
}

function resolveCaller(users: TestIdentity[], ref: number | Caller): Caller {
  if (typeof ref === "number") {
    const user = users[ref];
    if (user === undefined) {
      throw new Error(`no user at index ${ref}`);
    }
    return user;
  }
  return ref;
}

function recordKey(user: Principal, key: string): string {
  return `${user.toText()}:${key}`;
}

function sortEntries(entries: Array<[string, bigint]>): Array<[string, bigint]> {
  return [...entries].sort((a, b) => a[0].localeCompare(b[0]));
}

function normalizePoolInfo(info: PoolInfoLike): PoolInfoLike {
  return {
    id: info.id,
    key: info.key,
    ledgerA: info.ledgerA,
    ledgerB: info.ledgerB,
    reserveA: info.reserveA,
    reserveB: info.reserveB,
    totalShares: info.totalShares,
    lockedShares: info.lockedShares,
  };
}

function poolToInfo(pool: PoolModel): PoolInfoLike {
  return {
    id: pool.id,
    key: pool.key,
    ledgerA: pool.ledgerA,
    ledgerB: pool.ledgerB,
    reserveA: pool.reserveA,
    reserveB: pool.reserveB,
    totalShares: pool.totalShares,
    lockedShares: pool.lockedShares,
  };
}

type PoolInfoLike = {
  id: bigint;
  key: string;
  ledgerA: Principal;
  ledgerB: Principal;
  reserveA: bigint;
  reserveB: bigint;
  totalShares: bigint;
  lockedShares: bigint;
};

type WithdrawReceiptLike = {
  debitAmount: bigint;
};

export type SwapReceiptLike = {
  ledgerIn: Principal;
  ledgerOut: Principal;
  amountIn: bigint;
  amountOut: bigint;
  platformFee: bigint;
  reserveInAfter: bigint;
  reserveOutAfter: bigint;
};

export type AddReceiptLike = {
  ledgerA: Principal;
  ledgerB: Principal;
  poolKey: string;
  usedA: bigint;
  usedB: bigint;
  shares: bigint;
  lockedShares: bigint;
};

export type RemoveReceiptLike = {
  ledgerA: Principal;
  ledgerB: Principal;
  poolKey: string;
  amountA: bigint;
  amountB: bigint;
  shares: bigint;
};

type ReturnReceiptLike = {
  returnedUser: [] | [Principal];
  localBalance: bigint;
};

type DustReceiptLike = {
  abandonedAmount: bigint;
};
