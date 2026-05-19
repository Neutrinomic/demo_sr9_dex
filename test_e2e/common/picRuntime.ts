import {
  type Actor,
  createIdentity,
  PocketIc,
  PocketIcServer,
} from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";

let server: PocketIcServer | undefined;
let starting: Promise<PocketIcServer> | undefined;

export { type Actor, createIdentity, IDL, PocketIc, Principal };

export async function createPic(): Promise<PocketIc> {
  const active = await ensurePocketIcServer();
  return PocketIc.create(active.getUrl(), {
    processingTimeoutMs: Number.parseInt(
      process.env.PIC_PROCESSING_TIMEOUT_MS ?? "120000",
      10,
    ),
  });
}

export async function stopPocketIcServer(): Promise<void> {
  const active = server;
  server = undefined;
  starting = undefined;
  if (active !== undefined) {
    await active.stop();
  }
}

async function ensurePocketIcServer(): Promise<PocketIcServer> {
  if (server !== undefined) {
    return server;
  }
  if (starting !== undefined) {
    return starting;
  }
  starting = PocketIcServer.start({
    showRuntimeLogs: process.env.PIC_SHOW_RUNTIME_LOGS === "1",
    showCanisterLogs: process.env.PIC_SHOW_CANISTER_LOGS === "1",
  }).then((started) => {
    server = started;
    return started;
  }).finally(() => {
    starting = undefined;
  });
  return starting;
}
