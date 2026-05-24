import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type BasketDaoFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployBasketDao(
  pic: PocketIc,
  stakingLedger: Principal,
): Promise<BasketDaoFixture> {
  const deployed = await deployActorFixture(pic, "basketDao", {
    initArgs: IDL.encode([IDL.Principal], [stakingLedger]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
