import { deployActorFixture } from "../../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../../shared/common/runtime.ts";

export type BridgeFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployBridge(
  pic: PocketIc,
  ledger: Principal,
  minDeposit: bigint,
): Promise<BridgeFixture> {
  const deployed = await deployActorFixture(pic, "bridge", {
    initArgs: IDL.encode([IDL.Principal, IDL.Nat], [ledger, minDeposit]),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}

