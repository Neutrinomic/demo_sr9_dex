import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import { IDL, type PocketIc, type Principal } from "../../../../../../../shared/common/runtime.ts";

export type PaginatedWalletFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployPaginatedWallet(
  pic: PocketIc,
  ledger: Principal,
): Promise<PaginatedWalletFixture> {
  const deployed = await deployActorFixture(pic, "paginatedWallet", {
    initArgs: IDL.encode([IDL.Principal], [ledger]),
  });
  return { canisterId: deployed.canisterId, actor: deployed.actor };
}
