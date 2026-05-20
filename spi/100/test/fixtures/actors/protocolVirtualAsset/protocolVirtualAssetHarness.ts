import { deployActorFixture } from "../../../../../../shared/harness/actorFixture.ts";
import { IDL, type PocketIc, type Principal } from "../../../../../../shared/common/runtime.ts";

export type ProtocolVirtualAssetFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployProtocolVirtualAsset(
  pic: PocketIc,
  controller: Principal,
): Promise<ProtocolVirtualAssetFixture> {
  const deployed = await deployActorFixture(pic, "protocolVirtualAsset", {
    initArgs: IDL.encode([IDL.Principal], [controller]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
