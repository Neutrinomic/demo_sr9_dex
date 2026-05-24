import {
  createTestRuntime,
  type PocketIc,
  type TestIdentity,
  type TestRuntime,
} from "../../../../shared/common/runtime.ts";
import {
  deployDaoPending,
  type DaoPendingFixture,
} from "../fixtures/actors/daoPending/daoPendingHarness.ts";
import {
  deployDexPrincipalLp,
  type DexPrincipalLpFixture,
} from "../fixtures/actors/dexPrincipalLp/dexPrincipalLpHarness.ts";

export const IDENTITY_NAMES = [
  "alice",
  "bob",
  "tokenA",
  "tokenB",
  "lpShare",
  "governanceToken",
] as const;

export type Spi102E2E = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  pic: PocketIc;
  alice: TestIdentity;
  bob: TestIdentity;
  dex: DexPrincipalLpFixture;
  dao: DaoPendingFixture;
};

export async function setupSpi102E2E(): Promise<Spi102E2E> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi102",
  });
  const { pic, identities } = runtime;
  const {
    alice,
    bob,
    tokenA,
    tokenB,
    lpShare,
    governanceToken,
  } = identities;

  const dex = await deployDexPrincipalLp(pic, {
    tokenA: tokenA.getPrincipal(),
    tokenB: tokenB.getPrincipal(),
    lpShare: lpShare.getPrincipal(),
    swapFeeBps: 0n,
  });
  const dao = await deployDaoPending(
    pic,
    governanceToken.getPrincipal(),
    2_000_000_000n,
  );

  return {
    runtime,
    pic,
    alice,
    bob,
    dex,
    dao,
  };
}
