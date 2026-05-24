import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type MockLedgerFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployMockLedger(
  pic: PocketIc,
  fee: bigint,
): Promise<MockLedgerFixture> {
  const deployed = await deployActorFixture(pic, "mockLedger", {
    initArgs: IDL.encode([IDL.Nat], [fee]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}

