import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type GuardDexFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployGuardDex(
  pic: PocketIc,
  ledgerA: Principal,
  ledgerB: Principal,
): Promise<GuardDexFixture> {
  const deployed = await deployActorFixture(pic, "guardDex", {
    initArgs: IDL.encode([IDL.Principal, IDL.Principal], [ledgerA, ledgerB]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
