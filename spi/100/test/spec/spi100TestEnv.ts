import {
  createTestRuntime,
  type PocketIc,
  type TestIdentity,
  type TestRuntime,
} from "../../../../shared/common/runtime.ts";
import {
  deployAccountCodec,
  type AccountCodecFixture,
} from "../fixtures/actors/accountCodec/accountCodecHarness.ts";

export const IDENTITY_NAMES = ["alice", "bob", "wallet"] as const;

export type Spi100E2E = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  pic: PocketIc;
  alice: TestIdentity;
  bob: TestIdentity;
  wallet: TestIdentity;
  accountCodec: AccountCodecFixture;
};

export async function setupSpi100E2E(): Promise<Spi100E2E> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi100",
  });
  const accountCodec = await deployAccountCodec(runtime.pic);
  const { alice, bob, wallet } = runtime.identities;

  return {
    runtime,
    pic: runtime.pic,
    alice,
    bob,
    wallet,
    accountCodec,
  };
}
