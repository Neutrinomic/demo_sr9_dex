import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type ReceiptBridgeFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployReceiptBridge(
  pic: PocketIc,
  ledger: Principal,
  minDeposit: bigint,
  withdrawFee: bigint,
): Promise<ReceiptBridgeFixture> {
  const deployed = await deployActorFixture(pic, "receiptBridge", {
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

