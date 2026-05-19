import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { basename, isAbsolute, relative, resolve } from "path";
import wabtInit from "wabt";
import {
  actorArtifactPaths,
  actorCompilerFlags,
  actorConfig,
  actorKeyFromArg,
  actorKeys,
  actorPackages,
  actorSourcePath,
  E2E_DIR,
  resolvePackagePath,
  workspaceRoot,
} from "../config.ts";

const ENV_TO_IC0: Record<string, string> = {
  ic0_canister_self_size: "canister_self_size",
  ic0_canister_self_copy: "canister_self_copy",
  ic0_time: "time",
};

function envPath(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function sector9Bin(): string {
  const configured = envPath("SECTOR9_BIN") ?? envPath("SR9_BIN");
  if (configured !== undefined) {
    return configured;
  }
  throw new Error(
    "Set SECTOR9_BIN=/path/to/sr9 or SECTOR9_BIN=/path/to/sr9.sh.",
  );
}

function didcBin(): string {
  const homeDidc = resolve(process.env.HOME ?? "", ".local/bin/didc");
  return envPath("DIDC_BIN") ?? (existsSync(homeDidc) ? homeDidc : "didc");
}

async function run(
  cmd: string,
  args: string[],
  opts?: { stdout?: "pipe"; cwd?: string },
) {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: opts?.cwd ?? E2E_DIR,
    stdout: opts?.stdout ?? "inherit",
    stderr: "pipe",
  });
  const stderrPromise = new Response(proc.stderr).text();
  const stdoutPromise =
    opts?.stdout === "pipe" && proc.stdout !== undefined
      ? new Response(proc.stdout).text()
      : Promise.resolve("");
  const exit = await proc.exited;
  const stderr = await stderrPromise;
  const stdout = await stdoutPromise;
  if (exit !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed with exit ${exit}\n${stderr}`,
    );
  }
  return stdout;
}

function commandAvailable(cmd: string): boolean {
  if (cmd.includes("/") && existsSync(cmd)) {
    return true;
  }
  const proc = Bun.spawnSync([
    "sh",
    "-lc",
    'command -v "$1" >/dev/null 2>&1',
    "sh",
    cmd,
  ]);
  return proc.exitCode === 0;
}

function requireSector9Command(): string {
  const cmd = sector9Bin();
  if (!commandAvailable(cmd)) {
    throw new Error(
      `Cannot find SR9 command '${cmd}'. Set SECTOR9_BIN=/path/to/sr9 or SECTOR9_BIN=/path/to/sr9.sh.`,
    );
  }
  return cmd;
}

function commandPath(path: string): string {
  const root = workspaceRoot();
  const rel = relative(root, resolve(path));
  if (rel.length === 0) {
    return ".";
  }
  if (rel.startsWith("..")) {
    return path;
  }
  return rel;
}

function packageFlags(actorKey: string): string[] {
  const flags: string[] = [];
  for (const pkg of actorPackages(actorKey)) {
    let packagePath: string;
    try {
      packagePath = resolvePackagePath(pkg);
    } catch (err) {
      if (pkg.bundledFallback === true) {
        console.log(
          `Skipping package '${pkg.name}'; expecting the configured SR9 command to provide it.`,
        );
        continue;
      }
      throw err;
    }
    flags.push("--package", pkg.name, commandPath(packagePath));
  }
  return flags;
}

function actorKeysFromArgs(args: string[]): string[] {
  if (args.length === 0) {
    return [actorKeyFromArg()];
  }
  if (args.length === 1 && args[0] === "--all") {
    return actorKeys();
  }
  return args;
}

async function patchEnvImports(inputWasm: string, outputWasm: string) {
  const wabt = await wabtInit();
  const mod = wabt.readWasm(readFileSync(inputWasm), { readDebugNames: true });
  try {
    mod.generateNames();
    mod.applyNames();
    let wat = mod.toText({ foldExprs: false, inlineExport: false });

    const ic0IndexMap: Record<string, number> = {};
    const ic0ImportRe = /\(import "ic0" "(\w+)" \(func \(;(\d+);\)/g;
    for (const match of wat.matchAll(ic0ImportRe)) {
      ic0IndexMap[match[1]] = Number.parseInt(match[2], 10);
    }

    for (const [envName, ic0Name] of Object.entries(ENV_TO_IC0)) {
      const idx = ic0IndexMap[ic0Name];
      if (idx === undefined) {
        continue;
      }
      const importRe = new RegExp(
        `^\\s*\\(import "env" "${envName}".*\\)\\s*$`,
        "m",
      );
      if (!importRe.test(wat)) {
        continue;
      }
      wat = wat.replace(importRe, "");
      wat = wat.replace(new RegExp(`\\$${envName}\\b`, "g"), String(idx));
    }

    const parsed = wabt.parseWat("patched.wat", wat);
    try {
      const binary = parsed.toBinary({ write_debug_names: true });
      await Bun.write(outputWasm, binary.buffer);
    } finally {
      parsed.destroy();
    }
  } finally {
    mod.destroy();
  }
}

async function buildActor(actorKey: string, sector9: string) {
  const actor = actorConfig(actorKey);
  const source = actorSourcePath(actorKey);
  const paths = actorArtifactPaths(actorKey);

  if (!existsSync(source)) {
    throw new Error(`Cannot find actor source at ${source}`);
  }
  mkdirSync(paths.dir, { recursive: true });

  const runtimeFlags = [
    ...packageFlags(actorKey),
    ...actorCompilerFlags(actorKey),
  ];

  console.log(
    `Building actor '${actorKey}' from ${source} using ${basename(sector9)}`,
  );
  await run(sector9, [
    "-c",
    commandPath(source),
    "-o",
    commandPath(paths.rawWasm),
    ...runtimeFlags,
  ], { cwd: workspaceRoot() });
  await patchEnvImports(paths.rawWasm, paths.wasm);
  rmSync(paths.rawWasm, { force: true });

  console.log(`Generating ${paths.did}`);
  await run(sector9, [
    "--idl",
    commandPath(source),
    "-o",
    commandPath(paths.did),
    ...runtimeFlags,
  ], { cwd: workspaceRoot() });

  console.log(`Generating ${paths.idlJs}`);
  const idlJs = await run(didcBin(), ["bind", paths.did, "--target", "js"], {
    stdout: "pipe",
  });
  await Bun.write(paths.idlJs, idlJs);

  console.log(`${actor.name} fixture updated:`);
  console.log(`  ${paths.wasm}`);
  console.log(`  ${paths.did}`);
  console.log(`  ${paths.idlJs}`);
}

async function main() {
  const sector9 = requireSector9Command();
  const keys = actorKeysFromArgs(process.argv.slice(2));
  if (keys.length === 0) {
    throw new Error("No actors configured in the active project config.");
  }
  for (const actorKey of keys) {
    await buildActor(actorKey, sector9);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error(
    "Required tools: Bun, didc, and an SR9 command. " +
      "Set SECTOR9_BIN to your project wrapper, for example SECTOR9_BIN=./sr9 or SECTOR9_BIN=./sr9.sh.",
  );
  process.exit(1);
});
