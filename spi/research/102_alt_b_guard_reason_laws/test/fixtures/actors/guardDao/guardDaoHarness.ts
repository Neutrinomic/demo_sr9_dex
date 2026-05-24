import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type GuardDaoFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployGuardDao(
  pic: PocketIc,
  ledger: Principal,
): Promise<GuardDaoFixture> {
  const deployed = await deployActorFixture(pic, "guardDao", {
    initArgs: IDL.encode([IDL.Principal], [ledger]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}

