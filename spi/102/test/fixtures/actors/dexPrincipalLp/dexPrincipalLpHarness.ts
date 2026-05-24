import { deployActorFixture } from "../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../shared/common/runtime.ts";

export type DexPrincipalLpFixture = {
  canisterId: Principal;
  actor: any;
};

export type DexPrincipalLpInit = {
  tokenA: Principal;
  tokenB: Principal;
  lpShare: Principal;
  swapFeeBps: bigint;
};

export async function deployDexPrincipalLp(
  pic: PocketIc,
  init: DexPrincipalLpInit,
): Promise<DexPrincipalLpFixture> {
  const deployed = await deployActorFixture(pic, "dexPrincipalLp", {
    initArgs: IDL.encode(
      [IDL.Principal, IDL.Principal, IDL.Principal, IDL.Nat],
      [init.tokenA, init.tokenB, init.lpShare, init.swapFeeBps],
    ),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
