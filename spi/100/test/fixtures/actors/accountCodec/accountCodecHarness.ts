import { deployActorFixture } from "../../../../../../shared/harness/actorFixture.ts";
import {
  type PocketIc,
  type Principal,
} from "../../../../../../shared/common/runtime.ts";

export type AccountCodecFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployAccountCodec(
  pic: PocketIc,
): Promise<AccountCodecFixture> {
  const deployed = await deployActorFixture(pic, "accountCodec");
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
