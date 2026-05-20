import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stopPocketIcServer, unwrapOk } from "../../../../shared/common/runtime.ts";
import { balanceOf } from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  approveAndDeposit,
  claimUnstaked,
  DEFAULT_INITIAL_BALANCE,
  type DaoE2E,
  expectErrKey,
  requestUnstake,
  setupDaoE2E,
  stake,
  VOTING_LOCK_SECONDS,
  withdraw,
} from "./daoTestEnv.ts";

describe("dao withdrawal security", () => {
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

  test("withdrawal guards zero amount, fee headroom, and debits exactly amount plus fee", async () => {
    const amount = 100_000n;
    unwrapOk(await approveAndDeposit(env, env.alice, amount));
    const aliceAfterDeposit = await balanceOf(env.ledger, env.alice);

    expectErrKey(await withdraw(env, env.alice, 0n), "zeroAmount");
    expectErrKey(await withdraw(env, env.alice, amount), "insufficientLiquidBalance");
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).liquid).toBe(amount);

    const receipt = unwrapOk<any>(await withdraw(env, env.alice, amount - env.ledger.fee));
    expect(receipt.amount).toBe(amount - env.ledger.fee);
    expect(receipt.fee).toBe(env.ledger.fee);
    expect(receipt.debitAmount).toBe(amount);
    expect(receipt.liquidBalance).toBe(0n);
    expect(await env.dao.actor.dao_totals()).toEqual({
      totalSupply: 0n,
      totalLiquid: 0n,
      totalActiveStake: 0n,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 0n,
    });
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(0n);
    expect(await balanceOf(env.ledger, env.alice)).toBe(aliceAfterDeposit + amount - env.ledger.fee);
  });

  test("stopped ledger before fee query leaves no pending withdrawal or local debit", async () => {
    const amount = 50_000n;
    unwrapOk(await approveAndDeposit(env, env.alice, amount));

    await env.runtime.stopCanister(env.ledger.canisterId);
    expectErrKey(await withdraw(env, env.alice, 1n), "ledgerFeeRejected");
    expect(await env.dao.actor.pending_withdrawal(env.alice.getPrincipal())).toEqual([]);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).liquid).toBe(amount);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).pendingWithdraw).toBe(0n);
    expect((await env.dao.actor.dao_totals()).totalPendingWithdraw).toBe(0n);

    await env.runtime.startCanister(env.ledger.canisterId);
    const receipt = unwrapOk<any>(await withdraw(env, env.alice, amount - env.ledger.fee));
    expect(receipt.debitAmount).toBe(amount);
  });

  test("staked and pending-unstake tokens cannot be withdrawn until claimed liquid", async () => {
    const amount = 100_000n;
    unwrapOk(await approveAndDeposit(env, env.alice, amount));
    unwrapOk(await stake(env, env.alice, amount));

    expectErrKey(await withdraw(env, env.alice, 1n), "insufficientLiquidBalance");
    const requested = unwrapOk<any>(await requestUnstake(env, env.alice, amount));
    expect(requested.activeStake).toBe(0n);
    expect(requested.pendingUnstake).toBe(amount);
    expectErrKey(await withdraw(env, env.alice, 1n), "insufficientLiquidBalance");
    expectErrKey(await claimUnstaked(env, env.alice), "cooldownActive");

    await env.runtime.advanceSeconds(VOTING_LOCK_SECONDS + 1n, { ticks: 3 });
    const claimed = unwrapOk<any>(await claimUnstaked(env, env.alice));
    expect(claimed.amount).toBe(amount);
    expect(claimed.liquidBalance).toBe(amount);
    const withdrawn = unwrapOk<any>(await withdraw(env, env.alice, amount - env.ledger.fee));
    expect(withdrawn.debitAmount).toBe(amount);
  });

  test("same-user overlapping withdrawals settle at most one spend", async () => {
    const amount = 100_000n;
    unwrapOk(await approveAndDeposit(env, env.alice, amount));
    env.runtime.as(env.dao.actor, env.alice);

    const results = await Promise.all([
      env.dao.actor.withdraw(amount - env.ledger.fee),
      env.dao.actor.withdraw(amount - env.ledger.fee),
    ]);
    expect(results.filter((result) => "ok" in (result as object))).toHaveLength(1);
    expect(results.filter((result) => "err" in (result as object))).toHaveLength(1);
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(0n);
    expect(await env.dao.actor.dao_totals()).toEqual({
      totalSupply: 0n,
      totalLiquid: 0n,
      totalActiveStake: 0n,
      totalPendingUnstake: 0n,
      totalPendingWithdraw: 0n,
      totalProposalBonds: 0n,
    });
  });

  test("different users withdraw only their own liquid balances", async () => {
    unwrapOk(await approveAndDeposit(env, env.alice, 90_000n));
    unwrapOk(await approveAndDeposit(env, env.bob, 70_000n));
    const aliceBefore = await balanceOf(env.ledger, env.alice);
    const bobBefore = await balanceOf(env.ledger, env.bob);

    unwrapOk(await withdraw(env, env.alice, 80_000n));
    unwrapOk(await withdraw(env, env.bob, 60_000n));

    expect(await balanceOf(env.ledger, env.alice)).toBe(aliceBefore + 80_000n);
    expect(await balanceOf(env.ledger, env.bob)).toBe(bobBefore + 60_000n);
    expect((await env.dao.actor.stake_info(env.alice.getPrincipal())).liquid).toBe(0n);
    expect((await env.dao.actor.stake_info(env.bob.getPrincipal())).liquid).toBe(0n);
    expect(await balanceOf(env.ledger, env.dao.canisterId)).toBe(0n);
    expect(await balanceOf(env.ledger, env.alice)).toBeLessThan(DEFAULT_INITIAL_BALANCE);
    expect(await balanceOf(env.ledger, env.bob)).toBeLessThan(DEFAULT_INITIAL_BALANCE);
  });
});
