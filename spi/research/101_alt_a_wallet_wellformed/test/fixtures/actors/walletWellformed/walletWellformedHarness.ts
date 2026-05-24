import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type WalletWellformedFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployWalletWellformed(
  pic: PocketIc,
  ledger: Principal,
): Promise<WalletWellformedFixture> {
  const deployed = await deployActorFixture(pic, "walletWellformed", {
    initArgs: IDL.encode([IDL.Principal], [ledger]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
