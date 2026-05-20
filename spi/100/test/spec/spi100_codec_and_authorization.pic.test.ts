import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  Principal,
  stopPocketIcServer,
  unwrapOk,
  variantKey,
} from "../../../../shared/common/runtime.ts";
import {
  authorizeSpi100,
  canControlSpi100,
  decodeSpi100,
  encodeSpi100,
  principalEqual,
  resolveSpi100Control,
} from "../../../../shared/common/spi100.ts";
import { setupSpi100E2E, type Spi100E2E } from "./spi100TestEnv.ts";

type ControlInfo = {
  controller: Principal;
  id: [] | [bigint];
};

describe("SPI-100 codec and canister authorization", () => {
  let env: Spi100E2E | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("typescript codec matches canister-produced delegated account principals", async () => {
    env = await setupSpi100E2E();
    const alice = env.alice.getPrincipal();
    const bob = env.bob.getPrincipal();
    const shortController = env.protocol.canisterId;
    const expected = expectEncoded(shortController, 42n);

    const fromCanister = unwrapOk<Principal>(
      await env.runtime.callAs(env.unified.actor, shortController, (actor) =>
        actor.account(42n),
      ),
    );
    expectPrincipal(fromCanister, expected);

    const decoded = decodeSpi100(fromCanister);
    expect(decoded?.id).toBe(42n);
    expectPrincipal(decoded?.scope, shortController);

    const resolved = expectSome<ControlInfo>(
      await env.unified.actor.resolve(fromCanister),
    );
    expectPrincipal(resolved.controller, shortController);
    expect(resolved.id).toEqual([42n]);

    const direct = resolveSpi100Control(alice);
    expectPrincipal(direct?.controller, alice);
    expect(direct?.id).toBeNull();
    expect(encodeSpi100(alice, 42n)).toBeNull();
    expectErr(
      await env.runtime.callAs(env.unified.actor, env.alice, (actor) =>
        actor.account(42n),
      ),
      "virtualKeyUnavailable",
    );

    expect(canControlSpi100(shortController, fromCanister)).toBe(true);
    expect(authorizeSpi100(shortController, fromCanister)?.id).toBe(42n);
    expect(canControlSpi100(bob, fromCanister)).toBe(false);

    expect(
      await env.runtime.callAs(env.unified.actor, shortController, (actor) =>
        actor.canUse(fromCanister),
      ),
    ).toBe(true);
    expect(
      await env.runtime.callAs(env.unified.actor, env.bob, (actor) =>
        actor.canUse(fromCanister),
      ),
    ).toBe(false);
  });

  test("unified account actor accepts direct principals and authorized scoped principals", async () => {
    env = await setupSpi100E2E();
    const alice = env.alice.getPrincipal();
    const bob = env.bob.getPrincipal();
    const scopedController = env.protocol.canisterId;
    const scopedAccount = expectEncoded(scopedController, 7n);

    expectOkNat(
      await env.runtime.callAs(env.unified.actor, env.alice, (actor) =>
        actor.credit(alice, 100n),
      ),
      100n,
    );
    expectErr(
      await env.runtime.callAs(env.unified.actor, env.bob, (actor) =>
        actor.debit(alice, 1n),
      ),
      "invalidAccount",
    );

    expectOkNat(
      await env.runtime.callAs(env.unified.actor, scopedController, (actor) =>
        actor.credit(scopedAccount, 70n),
      ),
      70n,
    );
    expectErr(
      await env.runtime.callAs(env.unified.actor, env.bob, (actor) =>
        actor.credit(scopedAccount, 1n),
      ),
      "invalidAccount",
    );

    const transfer = unwrapOk<[bigint, bigint]>(
      await env.runtime.callAs(env.unified.actor, scopedController, (actor) =>
        actor.transfer(scopedAccount, bob, 25n),
      ),
    );
    expect(transfer).toEqual([45n, 25n]);
    expect(await env.unified.actor.balance(scopedAccount)).toBe(45n);
    expect(await env.unified.actor.balance(bob)).toBe(25n);
  });

  test("protocol-owned virtual asset principals roundtrip but are not caller-controlled", async () => {
    env = await setupSpi100E2E();
    const controller = env.controller.getPrincipal();
    const asset5 = unwrapOk<Principal>(await env.protocol.actor.asset(5n));
    const expected5 = expectEncoded(env.protocol.canisterId, 5n);
    expectPrincipal(asset5, expected5);

    const decoded = decodeSpi100(asset5);
    expect(decoded?.id).toBe(5n);
    expectPrincipal(decoded?.scope, env.protocol.canisterId);
    expect(canControlSpi100(controller, asset5)).toBe(false);

    expect(
      await env.runtime.callAs(env.protocol.actor, env.controller, (actor) =>
        actor.callerControlsAsset(5n),
      ),
    ).toBe(false);
    expect(
      await env.runtime.callAs(env.unified.actor, env.controller, (actor) =>
        actor.canUse(asset5),
      ),
    ).toBe(false);
    expectErr(
      await env.runtime.callAs(env.unified.actor, env.controller, (actor) =>
        actor.credit(asset5, 1n),
      ),
      "invalidAccount",
    );

    expectErr(
      await env.runtime.callAs(env.protocol.actor, env.alice, (actor) =>
        actor.controllerCredit(5n, 100n),
      ),
      "notController",
    );
    expectOkNat(
      await env.runtime.callAs(env.protocol.actor, env.controller, (actor) =>
        actor.controllerCredit(5n, 100n),
      ),
      100n,
    );

    const moved = unwrapOk<[bigint, bigint]>(
      await env.runtime.callAs(env.protocol.actor, env.controller, (actor) =>
        actor.controllerMove(5n, 6n, 30n),
      ),
    );
    expect(moved).toEqual([70n, 30n]);
    expectOkNat(await env.protocol.actor.balance(5n), 70n);
    expectOkNat(await env.protocol.actor.balance(6n), 30n);
  });
});

function expectEncoded(scope: Principal, id: bigint): Principal {
  const encoded = encodeSpi100(scope, id);
  if (encoded === null) {
    throw new Error(`failed to encode ${scope.toText()} with id ${id}`);
  }
  return encoded;
}

function expectPrincipal(
  actual: Principal | undefined,
  expected: Principal,
): void {
  expect(actual).toBeDefined();
  expect(principalEqual(actual as Principal, expected)).toBe(true);
  expect((actual as Principal).toText()).toBe(expected.toText());
}

function expectSome<T>(value: [] | [T]): T {
  expect(value).toHaveLength(1);
  return value[0] as T;
}

function expectOkNat(value: unknown, amount: bigint): void {
  expect(unwrapOk<bigint>(value)).toBe(amount);
}

function expectErr(value: unknown, key: string): void {
  expect(variantKey(value)).toBe("err");
  expect(variantKey((value as { err: unknown }).err)).toBe(key);
}
