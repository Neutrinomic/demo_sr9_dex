import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { type Actor, type PocketIc, type Principal } from "../common/runtime.ts";
import { actorArtifactPaths, actorCycles } from "./config.ts";

export type ActorFixture = {
  canisterId: Principal;
  actor: Actor<any>;
};

const EMPTY_CANDID_ARGS = new Uint8Array([0x44, 0x49, 0x44, 0x4c, 0x00, 0x00]);

export async function deployActorFixture(
  pic: PocketIc,
  actorKey: string,
  opts?: {
    initArgs?: ArrayBuffer | Uint8Array;
    cycles?: bigint;
  },
): Promise<ActorFixture> {
  const paths = actorArtifactPaths(actorKey);
  const { idlFactory } = await import(pathToFileURL(paths.idlJs).href);
  if (typeof idlFactory !== "function") {
    throw new Error(`Fixture ${paths.idlJs} does not export idlFactory.`);
  }
  const fixture = await pic.setupCanister<any>({
    idlFactory,
    wasm: new Uint8Array(readFileSync(paths.wasm)),
    arg:
      opts?.initArgs === undefined
        ? EMPTY_CANDID_ARGS
        : new Uint8Array(opts.initArgs),
    cycles: opts?.cycles ?? actorCycles(actorKey),
  });
  return {
    canisterId: fixture.canisterId,
    actor: fixture.actor,
  };
}
