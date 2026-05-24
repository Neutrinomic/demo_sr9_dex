import { deployActorFixture } from "../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../shared/common/runtime.ts";

export type IcrcWalletFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployIcrcWallet(
  pic: PocketIc,
  ledger: Principal,
  minDeposit: bigint,
  withdrawFee: bigint,
): Promise<IcrcWalletFixture> {
  const deployed = await deployActorFixture(pic, "icrcWallet", {
    initArgs: IDL.encode(
      [IDL.Principal, IDL.Nat, IDL.Nat],
      [ledger, minDeposit, withdrawFee],
    ),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
