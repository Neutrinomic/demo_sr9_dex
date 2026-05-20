import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer, unwrapOk } from "../../../../shared/common/runtime.ts";
import {
  approve,
  balanceOf,
  transfer,
} from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  approveAndDeposit,
  DEFAULT_INITIAL_BALANCE,
  deposit,
  type DaoE2E,
  expectErrKey,
  setupDaoE2E,
  withdraw,
} from "./daoTestEnv.ts";

const ZERO_TOTALS = {
  totalSupply: 0n,
  totalLiquid: 0n,
  totalActiveStake: 0n,
  totalPendingUnstake: 0n,
  totalPendingWithdraw: 0n,
  totalProposalBonds: 0n,
};

describe("dao deposit security", () => {
  let env: DaoE2E;

  beforeEach(async () => {
    env = await setupDaoE2E();
  });

  afterEach(async () => {
    await env.runtime.tearDown();
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("zero, missing approval, and stopped-ledger deposits do not create local credit", async () => {
    expectErrKey(await deposit(env, env.alice, 0n), "zeroAmount");
    expectErrKey(await deposit(env, env.alice, 50_000n), "ledgerTransferFromErr");
    expect(await env.dao.actor.dao_totals()).toEqual(ZERO_TOTALS);
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(0n);

    await approve(env.ledger, env.alice, env.dao.canisterId, 60_000n);
    await env.runtime.stopCanister(env.ledger.canisterId);
    expectErrKey(await deposit(env, env.alice, 50_000n), "ledgerTransferFromRejected");
    expect(await env.dao.actor.dao_totals()).toEqual(ZERO_TOTALS);

    await env.runtime.startCanister(env.ledger.canisterId);
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(0n);
    const receipt = unwrapOk<any>(await deposit(env, env.alice, 50_000n));
    expect(receipt.amount).toBe(50_000n);
    expect(receipt.liquidBalance).toBe(50_000n);
  });

  test("one-use allowance and concurrent deposit attempts credit only once", async () => {
    const amount = 75_000n;
    await approve(env.ledger, env.alice, env.dao.canisterId, amount + env.ledger.fee);

    const [first, second] = await Promise.all([
      deposit(env, env.alice, amount),
      deposit(env, env.alice, amount),
    ]);
    const results = [first, second];
    expect(results.filter((result) => "ok" in (result as object))).toHaveLength(1);
    expect(results.filter((result) => "err" in (result as object))).toHaveLength(1);
    expect(await env.dao.actor.dao_totals()).toEqual({
      ...ZERO_TOTALS,
      totalSupply: amount,
      totalLiquid: amount,
    });
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).liquid).toBe(amount);
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(amount);

    expectErrKey(await deposit(env, env.alice, amount), "ledgerTransferFromErr");
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).liquid).toBe(amount);
  });

  test("caller isolation prevents another user from spending approved or deposited credit", async () => {
    const amount = 100_000n;
    unwrapOk(await approveAndDeposit(env, env.alice, amount));

    expectErrKey(await deposit(env, env.bob, 50_000n), "ledgerTransferFromErr");
    expectErrKey(await withdraw(env, env.bob, 1n), "insufficientLiquidBalance");

    env.runtime.as(env.dao.actor, env.bob);
    expectErrKey(await env.dao.actor.stake(1n), "insufficientLiquidBalance");
    expectErrKey(await env.dao.actor.request_unstake(1n), "insufficientActiveStake");
    expectErrKey(await env.dao.actor.retry_withdrawal(), "noPendingWithdrawal");

    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).liquid).toBe(amount);
    expect((await env.dao.actor.stake_info(env.bob.getPrincipal())).liquid).toBe(0n);
    expect(await env.dao.actor.dao_totals()).toEqual({
      ...ZERO_TOTALS,
      totalSupply: amount,
      totalLiquid: amount,
    });
  });

  test("subaccount approval is not accepted by the default-account deposit flow", async () => {
    const amount = 40_000n;
    const sub = env.runtime.subaccount(7n);
    await approve(env.ledger, env.alice, env.dao.canisterId, amount + env.ledger.fee, {
      spenderSubaccount: sub,
    });

    expectErrKey(await deposit(env, env.alice, amount), "ledgerTransferFromErr");
    expect(await env.dao.actor.dao_totals()).toEqual(ZERO_TOTALS);

    await approve(env.ledger, env.alice, env.dao.canisterId, amount + env.ledger.fee);
    expect(unwrapOk<any>(await deposit(env, env.alice, amount)).amount).toBe(amount);
  });

  test("direct ledger transfers are not local DAO deposits or withdrawable credit", async () => {
    const directAmount = 80_000n;
    await transfer(env.ledger, env.alice, env.dao.canisterId, directAmount);

    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(directAmount);
    expect(await env.dao.actor.dao_totals()).toEqual(ZERO_TOTALS);
    expectErrKey(await withdraw(env, env.alice, 1n), "insufficientLiquidBalance");
    expectErrKey(await withdraw(env, env.bob, 1n), "insufficientLiquidBalance");

    const depositAmount = 100_000n;
    unwrapOk(await approveAndDeposit(env, env.alice, depositAmount));
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(directAmount + depositAmount);
    unwrapOk(await withdraw(env, env.alice, depositAmount - env.ledger.fee));

    expect(await env.dao.actor.dao_totals()).toEqual(ZERO_TOTALS);
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(directAmount);
    expect(await balanceOf(env.ledger, env.alice)).toBe(
      DEFAULT_INITIAL_BALANCE -
        directAmount -
        env.ledger.fee -
        depositAmount -
        env.ledger.fee -
        env.ledger.fee +
        depositAmount -
        env.ledger.fee,
    );
  });
});
