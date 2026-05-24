import { deployActorFixture } from "../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../shared/common/runtime.ts";

export type DaoPendingFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployDaoPending(
  pic: PocketIc,
  governanceToken: Principal,
  unstakeDelay: bigint,
): Promise<DaoPendingFixture> {
  const deployed = await deployActorFixture(pic, "daoPending", {
    initArgs: IDL.encode(
      [IDL.Principal, IDL.Int],
      [governanceToken, unstakeDelay],
    ),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
