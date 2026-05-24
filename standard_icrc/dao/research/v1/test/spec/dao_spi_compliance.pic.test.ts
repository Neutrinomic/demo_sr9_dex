import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  stopPocketIcServer,
  type Principal,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import { encodeSpi100 } from "../../../../shared/common/spi100.ts";
import {
  approve,
  balanceOf,
  transfer,
} from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";
import {
  type DaoE2E,
  expectErrKey,
  setupDaoE2E,
} from "./daoTestEnv.ts";

describe("dao SPI-100 and SPI-101 compliance", () => {
  let env: DaoE2E;

  async function fundAndApproveController(controller: Principal, amount: bigint): Promise<void> {
    await transfer(
      env.ledger,
      env.alice,
      controller,
      amount + env.ledger.fee + env.ledger.fee,
    );
    await approve(env.ledger, controller, env.dao.canisterId, amount + env.ledger.fee);
    env.runtime.as(env.dao.actor, controller);
  }

  beforeEach(async () => {
    env = await setupDaoE2E();
  });

  afterEach(async () => {
    await env.runtime.tearDown();
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("SPI-101 deposit credits the requested direct subject and balance reports it", async () => {
    const amount = 25_000n;
    const subject = env.alice.getPrincipal();
    await approve(env.ledger, env.alice, env.dao.canisterId, amount + env.ledger.fee);
    env.runtime.as(env.dao.actor, env.alice);

    const receipt = unwrapOk<any>(await env.dao.actor.spi_101_deposit({
      subject,
      ledger: env.ledger.canisterId,
      from: env.runtime.account(env.alice),
      amount,
    }));

    expect(receipt.subject.toText()).toBe(subject.toText());
    expect(receipt.balanceAfter).toBe(amount);
    expect(await env.dao.actor.spi_101_balance({ subject })).toEqual({
      subject,
      entries: [[env.ledger.canisterId, amount]],
    });
    expect((await env.dao.actor.stake_info(subject)).liquid).toBe(amount);
  });

  test("SPI-100 delegated subject can hold, stake, and isolate governance state", async () => {
    const controller = env.ledger.canisterId;
    const subject = encodeSpi100(controller, 7n);
    if (subject === null) {
      throw new Error("controller principal cannot encode an SPI-100 subject");
    }
    const amount = 40_000n;
    await fundAndApproveController(controller, amount);

    unwrapOk(await env.dao.actor.spi_101_deposit({
      subject,
      ledger: env.ledger.canisterId,
      from: env.runtime.account(controller),
      amount,
    }));
    const staked = unwrapOk<any>(await env.dao.actor.stake(subject, 15_000n));

    expect(staked.activeStake).toBe(15_000n);
    expect((await env.dao.actor.stake_info(subject)).liquid).toBe(25_000n);
    expect((await env.dao.actor.stake_info(controller)).liquid).toBe(0n);
    expect(await env.dao.actor.spi_101_balance({ subject })).toEqual({
      subject,
      entries: [[env.ledger.canisterId, 25_000n]],
    });
  });

  test("another caller cannot spend or govern through a delegated subject", async () => {
    const controller = env.ledger.canisterId;
    const subject = encodeSpi100(controller, 11n);
    if (subject === null) {
      throw new Error("controller principal cannot encode an SPI-100 subject");
    }
    const amount = 30_000n;
    await fundAndApproveController(controller, amount);
    unwrapOk(await env.dao.actor.spi_101_deposit({
      subject,
      ledger: env.ledger.canisterId,
      from: env.runtime.account(controller),
      amount,
    }));

    env.runtime.as(env.dao.actor, env.bob);
    expectErrKey(await env.dao.actor.spi_101_withdraw({
      subject,
      ledger: env.ledger.canisterId,
      to: env.runtime.account(env.bob),
      amount: 1n,
    }), "subjectNotAuthorized");
    expectErrKey(await env.dao.actor.stake(subject, 1n), "subjectNotAuthorized");
    expect((await env.dao.actor.stake_info(subject)).liquid).toBe(amount);
  });

  test("SPI-101 withdraw can send to an ICRC subaccount and charges the ledger fee", async () => {
    const controller = env.ledger.canisterId;
    const subject = encodeSpi100(controller, 21n);
    if (subject === null) {
      throw new Error("controller principal cannot encode an SPI-100 subject");
    }
    const depositAmount = 50_000n;
    const withdrawAmount = 10_000n;
    const subaccount = env.runtime.subaccount(3n);
    await fundAndApproveController(controller, depositAmount);
    unwrapOk(await env.dao.actor.spi_101_deposit({
      subject,
      ledger: env.ledger.canisterId,
      from: env.runtime.account(controller),
      amount: depositAmount,
    }));

    const receipt = unwrapOk<any>(await env.dao.actor.spi_101_withdraw({
      subject,
      ledger: env.ledger.canisterId,
      to: env.runtime.account(env.bob, subaccount),
      amount: withdrawAmount,
    }));

    expect(receipt.debitAmount).toBe(withdrawAmount + env.ledger.fee);
    expect(receipt.balanceAfter).toBe(depositAmount - withdrawAmount - env.ledger.fee);
    expect(await balanceOf(env.ledger, env.bob, subaccount)).toBe(withdrawAmount);
  });

  test("SPI-101 rejects unsupported and virtual ledger principals", async () => {
    const subject = env.alice.getPrincipal();
    const virtualLedger = encodeSpi100(env.dao.canisterId, 0n);
    if (virtualLedger === null) {
      throw new Error("dao principal cannot encode an SPI-100 virtual ledger");
    }
    env.runtime.as(env.dao.actor, env.alice);

    expectErrKey(await env.dao.actor.spi_101_deposit({
      subject,
      ledger: virtualLedger,
      from: env.runtime.account(env.alice),
      amount: 1n,
    }), "ledgerNotSupported");
    expectErrKey(await env.dao.actor.spi_101_withdraw({
      subject,
      ledger: virtualLedger,
      to: env.runtime.account(env.alice),
      amount: 1n,
    }), "ledgerNotSupported");
  });

  test("SPI-101 rejects source accounts not owned by the caller", async () => {
    env.runtime.as(env.dao.actor, env.alice);
    const result = await env.dao.actor.spi_101_deposit({
      subject: env.alice.getPrincipal(),
      ledger: env.ledger.canisterId,
      from: env.runtime.account(env.bob),
      amount: 10n,
    });

    expect(variantKey(result)).toBe("err");
    expect(variantKey((result as { err: unknown }).err)).toBe("sourceOwnerMismatch");
  });
});
