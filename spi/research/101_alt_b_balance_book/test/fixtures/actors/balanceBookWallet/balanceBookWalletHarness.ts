import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import { IDL, type PocketIc, type Principal } from "../../../../../../../shared/common/runtime.ts";

export type BalanceBookWalletFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployBalanceBookWallet(
  pic: PocketIc,
  ledger: Principal,
): Promise<BalanceBookWalletFixture> {
  const deployed = await deployActorFixture(pic, "balanceBookWallet", {
    initArgs: IDL.encode([IDL.Principal], [ledger]),
  });
  return { canisterId: deployed.canisterId, actor: deployed.actor };
}
