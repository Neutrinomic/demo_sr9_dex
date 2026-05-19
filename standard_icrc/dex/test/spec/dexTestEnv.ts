import {
  createTestRuntime,
  type PocketIc,
  type TestIdentity,
  type TestRuntime,
  unwrapOk,
} from "../../../../shared/common/runtime.ts";
import { deployDex, type DexFixture } from "../fixtures/actors/dex/dexHarness.ts";
import {
  deployIcrcLedger,
  type IcrcLedgerFixture,
} from "../../../../shared/fixtures/icrc_ledger/ledgerHarness.ts";

export const IDENTITY_NAMES = ["controller", "alice", "bob"] as const;

export type DexE2E = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  pic: PocketIc;
  controller: TestIdentity;
  alice: TestIdentity;
  bob: TestIdentity;
  dex: DexFixture;
  ledgerA: IcrcLedgerFixture;
  ledgerB: IcrcLedgerFixture;
};

export async function setupDexE2E(): Promise<DexE2E> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
  });
  const { pic, identities } = runtime;
  const { controller, alice, bob } = identities;

  const dex = await deployDex(pic, controller.getPrincipal());
  runtime.as(dex.actor, controller);

  const ledgerA = await deployIcrcLedger(pic, {
    controller,
    symbol: "TKA",
    initialBalances: [
      { owner: alice, amount: 10_000_000_000n },
      { owner: bob, amount: 10_000_000_000n },
    ],
  });
  const ledgerB = await deployIcrcLedger(pic, {
    controller,
    symbol: "TKB",
    initialBalances: [
      { owner: alice, amount: 10_000_000_000n },
      { owner: bob, amount: 10_000_000_000n },
    ],
  });

  return {
    runtime,
    pic,
    controller,
    alice,
    bob,
    dex,
    ledgerA,
    ledgerB,
  };
}

export async function whitelistLedgers(env: DexE2E): Promise<void> {
  env.runtime.as(env.dex.actor, env.controller);
  const addA = await env.dex.actor.controller_ledger({
    add: env.ledgerA.canisterId,
  });
  const addB = await env.dex.actor.controller_ledger({
    add: env.ledgerB.canisterId,
  });

  unwrapOk(addA);
  unwrapOk(addB);
}

export async function createDefaultPool(env: DexE2E): Promise<unknown> {
  env.runtime.as(env.dex.actor, env.controller);
  return env.dex.actor.createPool(env.ledgerA.canisterId, env.ledgerB.canisterId);
}
