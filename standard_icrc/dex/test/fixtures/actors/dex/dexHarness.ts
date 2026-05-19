import { deployActorFixture } from "../../../../../../shared/harness/actorFixture.ts";
import { IDL, type PocketIc, type Principal } from "../../../../../../shared/common/runtime.ts";

export type DexFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployDex(
  pic: PocketIc,
  controller: Principal,
): Promise<DexFixture> {
  const deployed = await deployActorFixture(pic, "dex", {
    initArgs: IDL.encode([IDL.Principal], [controller]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
