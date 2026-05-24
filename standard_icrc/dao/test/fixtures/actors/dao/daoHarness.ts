import { deployActorFixture } from "../../../../../../shared/harness/actorFixture.ts";
import {
  IDL,
  type PocketIc,
  type Principal,
} from "../../../../../../shared/common/runtime.ts";

export type DaoFixture = {
  canisterId: Principal;
  actor: any;
};

export async function deployDao(
  pic: PocketIc,
  governanceLedger: Principal,
  initialQuorumVotes = 1n,
  initialProposalThreshold = 1n,
): Promise<DaoFixture> {
  const deployed = await deployActorFixture(pic, "dao", {
    initArgs: IDL.encode(
      [IDL.Principal, IDL.Nat, IDL.Nat],
      [governanceLedger, initialQuorumVotes, initialProposalThreshold],
    ),
  });
  return {
    canisterId: deployed.canisterId,
    actor: deployed.actor,
  };
}
