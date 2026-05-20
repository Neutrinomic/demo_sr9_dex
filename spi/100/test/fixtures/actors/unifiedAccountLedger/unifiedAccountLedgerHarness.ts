import { deployActorFixture } from "../../../../../../shared/harness/actorFixture.ts";
import { type PocketIc, type Principal } from "../../../../../../shared/common/runtime.ts";

export type UnifiedAccountLedgerFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployUnifiedAccountLedger(
  pic: PocketIc,
): Promise<UnifiedAccountLedgerFixture> {
  const deployed = await deployActorFixture(pic, "unifiedAccountLedger");
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
