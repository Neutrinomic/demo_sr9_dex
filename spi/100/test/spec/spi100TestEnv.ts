import {
  createTestRuntime,
  type PocketIc,
  type TestIdentity,
  type TestRuntime,
} from "../../../../shared/common/runtime.ts";
import {
  deployProtocolVirtualAsset,
  type ProtocolVirtualAssetFixture,
} from "../fixtures/actors/protocolVirtualAsset/protocolVirtualAssetHarness.ts";
import {
  deployUnifiedAccountLedger,
  type UnifiedAccountLedgerFixture,
} from "../fixtures/actors/unifiedAccountLedger/unifiedAccountLedgerHarness.ts";

export const IDENTITY_NAMES = ["controller", "alice", "bob"] as const;

export type Spi100E2E = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  pic: PocketIc;
  controller: TestIdentity;
  alice: TestIdentity;
  bob: TestIdentity;
  unified: UnifiedAccountLedgerFixture;
  protocol: ProtocolVirtualAssetFixture;
};

export async function setupSpi100E2E(): Promise<Spi100E2E> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi100",
  });
  const { pic, identities } = runtime;
  const { controller, alice, bob } = identities;

  const unified = await deployUnifiedAccountLedger(pic);
  const protocol = await deployProtocolVirtualAsset(pic, controller.getPrincipal());

  return {
    runtime,
    pic,
    controller,
    alice,
    bob,
    unified,
    protocol,
  };
}
