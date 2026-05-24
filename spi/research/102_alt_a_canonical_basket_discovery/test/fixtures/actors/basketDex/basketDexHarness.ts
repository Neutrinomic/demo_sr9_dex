import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type BasketDexFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployBasketDex(
  pic: PocketIc,
  ledgerA: Principal,
  ledgerB: Principal,
): Promise<BasketDexFixture> {
  const deployed = await deployActorFixture(pic, "basketDex", {
    initArgs: IDL.encode([IDL.Principal, IDL.Principal], [ledgerA, ledgerB]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}

