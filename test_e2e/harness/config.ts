import { existsSync, readFileSync } from "fs";
import { availableParallelism } from "node:os";
import { dirname, isAbsolute, resolve } from "path";

export const E2E_DIR = resolve(import.meta.dir, "..");
export const CONFIG_PATH = resolve(E2E_DIR, "config.json");

export type PackageConfig = {
  name: string;
  path: string;
  env?: string;
  findUp?: boolean;
  bundledFallback?: boolean;
};

export type ActorConfig = {
  name: string;
  source: string;
  outputDir?: string;
  cycles?: string;
  compileFlags?: string[];
  packages?: PackageConfig[];
};

export type E2EConfig = {
  workspaceRoot?: string;
  actorFixturesDir?: string;
  defaultActor?: string;
  test?: TestConfig;
  actors: Record<string, ActorConfig>;
};

export type TestConfig = {
  specGlob?: string;
  timeoutMs?: number;
  jobs?: number;
  reportsDir?: string;
};

export type ActorArtifactPaths = {
  dir: string;
  rawWasm: string;
  wasm: string;
  did: string;
  idlJs: string;
};

export function loadConfig(): E2EConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as E2EConfig;
}

export function testConfig(): Required<TestConfig> {
  const test = loadConfig().test ?? {};
  return {
    specGlob: test.specGlob ?? "spec/**/*.test.ts",
    timeoutMs: test.timeoutMs ?? 240_000,
    jobs:
      Number.parseInt(process.env.E2E_JOBS ?? "", 10) ||
      test.jobs ||
      Math.max(1, Math.min(4, availableParallelism())),
    reportsDir: resolveConfigPath(process.env.E2E_REPORT_DIR ?? test.reportsDir ?? "reports"),
  };
}

export function actorKeys(): string[] {
  return Object.keys(loadConfig().actors);
}

export function workspaceRoot(): string {
  return resolveConfigPath(loadConfig().workspaceRoot ?? ".");
}

export function actorKeyFromArg(arg?: string): string {
  if (arg !== undefined && arg.length > 0) {
    return arg;
  }
  const defaultActor = loadConfig().defaultActor;
  if (defaultActor === undefined || defaultActor.length === 0) {
    throw new Error("No actor key given and config.json has no defaultActor.");
  }
  return defaultActor;
}

export function actorConfig(actorKey: string): ActorConfig {
  const actor = loadConfig().actors[actorKey];
  if (actor === undefined) {
    throw new Error(`No actor named '${actorKey}' in ${CONFIG_PATH}.`);
  }
  return actor;
}

export function actorSourcePath(actorKey: string): string {
  return resolveConfigPath(actorConfig(actorKey).source);
}

export function actorCycles(actorKey: string): bigint | undefined {
  const cycles = actorConfig(actorKey).cycles;
  return cycles === undefined ? undefined : BigInt(cycles);
}

export function actorArtifactPaths(actorKey: string): ActorArtifactPaths {
  const actor = actorConfig(actorKey);
  const config = loadConfig();
  const baseDir = config.actorFixturesDir ?? "fixtures/actors";
  const dir = resolveConfigPath(
    actor.outputDir ?? `${baseDir}/${actorKey}`,
  );
  return {
    dir,
    rawWasm: resolve(dir, `${actor.name}.raw.wasm`),
    wasm: resolve(dir, `${actor.name}.wasm`),
    did: resolve(dir, `${actor.name}.did`),
    idlJs: resolve(dir, `${actor.name}.idl.js`),
  };
}

export function actorCompilerFlags(actorKey: string): string[] {
  return actorConfig(actorKey).compileFlags ?? [];
}

export function actorPackages(actorKey: string): PackageConfig[] {
  return actorConfig(actorKey).packages ?? [];
}

export function resolveConfigPath(path: string): string {
  return isAbsolute(path) ? path : resolve(E2E_DIR, path);
}

export function resolvePackagePath(pkg: PackageConfig): string {
  if (pkg.env !== undefined) {
    const fromEnv = process.env[pkg.env];
    if (fromEnv !== undefined && fromEnv.length > 0) {
      return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
    }
  }

  if (pkg.findUp === true) {
    const found = findUp(E2E_DIR, pkg.path);
    if (found !== undefined) {
      return found;
    }
  }

  const resolved = resolveConfigPath(pkg.path);
  if (existsSync(resolved)) {
    return resolved;
  }

  const envHint =
    pkg.env === undefined ? "" : ` or set ${pkg.env}=/path/to/${pkg.name}`;
  throw new Error(
    `Cannot resolve package '${pkg.name}' at '${pkg.path}'${envHint}.`,
  );
}

export function findUp(start: string, relative: string): string | undefined {
  let current = resolve(start);
  while (true) {
    const candidate = resolve(current, relative);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}
