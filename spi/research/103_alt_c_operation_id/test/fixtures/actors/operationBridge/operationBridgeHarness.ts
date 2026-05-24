import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type OperationBridgeFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployOperationBridge(
  pic: PocketIc,
  ledger: Principal,
  minDeposit: bigint,
  withdrawFee: bigint,
): Promise<OperationBridgeFixture> {
  const deployed = await deployActorFixture(pic, "operationBridge", {
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

