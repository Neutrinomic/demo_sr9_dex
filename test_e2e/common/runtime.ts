import {
  type Actor,
  createIdentity,
  createPic,
  IDL,
  PocketIc,
  Principal,
  stopPocketIcServer,
} from "./picRuntime.ts";

export {
  type Actor,
  createIdentity,
  createPic,
  IDL,
  PocketIc,
  Principal,
  stopPocketIcServer,
};

export type TestIdentity = ReturnType<typeof createIdentity>;

export type Caller = TestIdentity | Principal;

export type ActorWithCaller = {
  setIdentity?(identity: TestIdentity): void;
  setPrincipal?(principal: Principal): void;
};

export type TimeAdvanceOptions = {
  ticks?: number;
};

export type TimeStepOptions = {
  stepMs?: number;
  ticksPerStep?: number;
};

export type WithCallerOptions = {
  restore?: Caller;
};

export type IcrcSubaccount = number[];

export type IcrcSubaccountInput = number[] | Uint8Array | ArrayBuffer;

export type IcrcSubaccountOpt = [] | [IcrcSubaccount];

export type TestRuntime<Names extends readonly string[] = readonly string[]> = {
  pic: PocketIc;
  identities: { [K in Names[number]]: TestIdentity };
  time: TimeDriver;
  identity(name: string): TestIdentity;
  principal(name: string): Principal;
  as<T extends ActorWithCaller>(actor: T, caller: Caller): T;
  callAs<T extends ActorWithCaller, R>(
    actor: T,
    caller: Caller,
    fn: (actor: T) => R | Promise<R>,
  ): Promise<R>;
  withCaller<T extends ActorWithCaller, R>(
    actor: T,
    caller: Caller,
    fn: (actor: T) => R | Promise<R>,
    opts?: WithCallerOptions,
  ): Promise<R>;
  passTime(steps?: number, opts?: TimeStepOptions): Promise<void>;
  advanceSeconds(
    seconds: number | bigint,
    opts?: TimeAdvanceOptions,
  ): Promise<void>;
  block(count?: number): Promise<void>;
  account(
    owner: Names[number] | Caller,
    subaccount?: IcrcSubaccountInput,
  ): IcrcAccount;
  subaccount(id: number | bigint): IcrcSubaccount;
  accountText(account: IcrcAccount): string;
  subaccountText(subaccount?: IcrcSubaccountInput): string;
  stopCanister(canisterId: Principal): Promise<void>;
  startCanister(canisterId: Principal, ticks?: number): Promise<void>;
  restartCanister(canisterId: Principal, ticks?: number): Promise<void>;
  withStoppedCanister<R>(
    canisterId: Principal,
    fn: () => R | Promise<R>,
    ticksAfterStart?: number,
  ): Promise<R>;
  tearDown(): Promise<void>;
};

export type IcrcAccount = {
  owner: Principal;
  subaccount: IcrcSubaccountOpt;
};

const DEFAULT_TIME_STEP_MS = 3_000;
const DEFAULT_TIME_STEP_TICKS = 2;
const ICRC_SUBACCOUNT_BYTES = 32;

export function testIdentity(name: string): TestIdentity {
  return createIdentity(`dex-${name}`);
}

export function testIdentities<const Names extends readonly string[]>(
  names: Names,
  prefix = "dex",
): { [K in Names[number]]: TestIdentity } {
  const result: Record<string, TestIdentity> = {};
  for (const name of names) {
    result[name] = createIdentity(`${prefix}-${name}`);
  }
  return result as { [K in Names[number]]: TestIdentity };
}

export function subaccount(input: IcrcSubaccountInput): IcrcSubaccount {
  const bytes =
    input instanceof ArrayBuffer
      ? Array.from(new Uint8Array(input))
      : Array.from(input);
  if (bytes.length !== ICRC_SUBACCOUNT_BYTES) {
    throw new Error(
      `ICRC subaccount must be ${ICRC_SUBACCOUNT_BYTES} bytes, got ${bytes.length}.`,
    );
  }
  for (const byte of bytes) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error(`Invalid ICRC subaccount byte: ${byte}.`);
    }
  }
  return bytes;
}

export function subaccountOpt(
  input?: IcrcSubaccountInput,
): IcrcSubaccountOpt {
  return input === undefined ? [] : [subaccount(input)];
}

export function subaccountFromId(id: number | bigint): IcrcSubaccount {
  let value = BigInt(id);
  if (value < 0n) {
    throw new Error(`ICRC subaccount id must be non-negative, got ${id}.`);
  }
  const bytes = Array<number>(ICRC_SUBACCOUNT_BYTES).fill(0);
  for (let i = ICRC_SUBACCOUNT_BYTES - 1; i >= 0; i -= 1) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  if (value !== 0n) {
    throw new Error(`ICRC subaccount id is too large: ${id}.`);
  }
  return bytes;
}

export function subaccountToText(input?: IcrcSubaccountInput): string {
  if (input === undefined) {
    return "default";
  }
  return subaccount(input)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function subaccountFromText(text: string): IcrcSubaccount {
  const normalized = text.startsWith("0x") ? text.slice(2) : text;
  if (normalized.length !== ICRC_SUBACCOUNT_BYTES * 2) {
    throw new Error(
      `ICRC subaccount text must be ${ICRC_SUBACCOUNT_BYTES * 2} hex chars.`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid ICRC subaccount hex: ${text}.`);
  }
  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    bytes.push(Number.parseInt(normalized.slice(i, i + 2), 16));
  }
  return subaccount(bytes);
}

export function account(
  owner: Caller,
  subaccount?: IcrcSubaccountInput,
): IcrcAccount {
  return {
    owner: principalOf(owner),
    subaccount: subaccountOpt(subaccount),
  };
}

export const icrcAccount = account;

export function accountToText(account: IcrcAccount): string {
  if (account.subaccount.length === 0) {
    return account.owner.toText();
  }
  return `${account.owner.toText()}:${subaccountToText(account.subaccount[0])}`;
}

export function accountFromText(text: string): IcrcAccount {
  const [ownerText, subaccountText, extra] = text.split(":");
  if (
    ownerText === undefined ||
    ownerText.length === 0 ||
    extra !== undefined
  ) {
    throw new Error(`Invalid ICRC account text: ${text}.`);
  }
  return account(
    Principal.fromText(ownerText),
    subaccountText === undefined
      ? undefined
      : subaccountFromText(subaccountText),
  );
}

export function ledgerKey(ledger: Principal): string {
  return `ledger:${ledger.toText()}`;
}

export function poolKey(ledgerA: Principal, ledgerB: Principal): string {
  const [a, b] =
    ledgerA.compareTo(ledgerB) !== "gt"
      ? [ledgerA, ledgerB]
      : [ledgerB, ledgerA];
  return `pool:${a.toText()}:${b.toText()}`;
}

export function principalOf(caller: Caller): Principal {
  if (isIdentity(caller)) {
    return caller.getPrincipal();
  }
  return caller;
}

export function asCaller<T extends ActorWithCaller>(
  actor: T,
  caller: Caller,
): T {
  if (isIdentity(caller)) {
    if (actor.setIdentity === undefined) {
      throw new Error("actor does not support setIdentity");
    }
    actor.setIdentity(caller);
    return actor;
  }
  if (actor.setPrincipal === undefined) {
    throw new Error("actor does not support setPrincipal");
  }
  actor.setPrincipal(caller);
  return actor;
}

export async function callAs<T extends ActorWithCaller, R>(
  actor: T,
  caller: Caller,
  fn: (actor: T) => R | Promise<R>,
): Promise<R> {
  asCaller(actor, caller);
  return await fn(actor);
}

export async function withCaller<T extends ActorWithCaller, R>(
  actor: T,
  caller: Caller,
  fn: (actor: T) => R | Promise<R>,
  opts: WithCallerOptions = {},
): Promise<R> {
  asCaller(actor, caller);
  try {
    return await fn(actor);
  } finally {
    if (opts.restore !== undefined) {
      asCaller(actor, opts.restore);
    }
  }
}

function isIdentity(caller: Caller): caller is TestIdentity {
  return (
    typeof (caller as { getPrincipal?: unknown }).getPrincipal === "function"
  );
}

export class TimeDriver {
  constructor(readonly pic: PocketIc) {}

  async nowMs(): Promise<number> {
    return await this.pic.getTime();
  }

  async nowNanos(): Promise<bigint> {
    return BigInt(await this.nowMs()) * 1_000_000n;
  }

  async set(time: Date | number, opts: TimeAdvanceOptions = {}): Promise<void> {
    await this.pic.setTime(time);
    await this.produceBlocks(opts.ticks ?? 1);
  }

  async produceBlocks(count = 1): Promise<void> {
    await this.pic.tick(count);
  }

  async advanceMs(
    millis: number,
    opts: TimeAdvanceOptions = {},
  ): Promise<void> {
    await this.pic.advanceTime(millis);
    await this.produceBlocks(opts.ticks ?? 1);
  }

  async advanceSeconds(
    seconds: number | bigint,
    opts: TimeAdvanceOptions = {},
  ): Promise<void> {
    await this.advanceMs(Number(seconds) * 1_000, opts);
  }

  async advanceMinutes(
    minutes: number | bigint,
    opts: TimeAdvanceOptions = { ticks: 3 },
  ): Promise<void> {
    await this.advanceMs(Number(minutes) * 60_000, opts);
  }

  async passTime(steps = 1, opts: TimeStepOptions = {}): Promise<void> {
    const stepMs = opts.stepMs ?? DEFAULT_TIME_STEP_MS;
    const ticksPerStep = opts.ticksPerStep ?? DEFAULT_TIME_STEP_TICKS;
    for (let i = 0; i < steps; i += 1) {
      await this.pic.advanceTime(stepMs);
      await this.pic.tick(ticksPerStep);
    }
  }

  async steps(opts: TimeStepOptions & { steps?: number } = {}): Promise<void> {
    await this.passTime(opts.steps ?? 1, opts);
  }

  async settle(ticks = DEFAULT_TIME_STEP_TICKS): Promise<void> {
    await this.produceBlocks(ticks);
  }
}

export async function createTestRuntime<
  const Names extends readonly string[] = readonly string[],
>(opts: {
  identities?: Names;
  identityPrefix?: string;
  startTime?: Date | number;
  ticksAfterSetTime?: number;
} = {}): Promise<TestRuntime<Names>> {
  const pic = await createPic();
  const time = new TimeDriver(pic);
  const identities = testIdentities(
    opts.identities ?? ([] as unknown as Names),
    opts.identityPrefix ?? "dex",
  );

  if (opts.startTime !== undefined) {
    await time.set(opts.startTime, { ticks: opts.ticksAfterSetTime ?? 1 });
  }

  const identityByName = (name: string): TestIdentity => {
    const found = (identities as Record<string, TestIdentity>)[name];
    if (found === undefined) {
      throw new Error(`No test identity named '${name}'.`);
    }
    return found;
  };

  return {
    pic,
    identities,
    time,
    identity(name: string): TestIdentity {
      return identityByName(name);
    },
    principal(name: string): Principal {
      return identityByName(name).getPrincipal();
    },
    as: asCaller,
    callAs,
    withCaller,
    async passTime(steps = 1, opts: TimeStepOptions = {}): Promise<void> {
      await time.passTime(steps, opts);
    },
    async advanceSeconds(
      seconds: number | bigint,
      opts: TimeAdvanceOptions = {},
    ): Promise<void> {
      await time.advanceSeconds(seconds, opts);
    },
    async block(count = 1): Promise<void> {
      await time.produceBlocks(count);
    },
    account(
      owner: Names[number] | Caller,
      sub?: IcrcSubaccountInput,
    ): IcrcAccount {
      const actualOwner =
        typeof owner === "string"
          ? identityByName(owner)
          : owner;
      return account(actualOwner, sub);
    },
    subaccount(id: number | bigint): IcrcSubaccount {
      return subaccountFromId(id);
    },
    accountText(value: IcrcAccount): string {
      return accountToText(value);
    },
    subaccountText(value?: IcrcSubaccountInput): string {
      return subaccountToText(value);
    },
    async stopCanister(canisterId: Principal): Promise<void> {
      await pic.stopCanister({ canisterId });
    },
    async startCanister(canisterId: Principal, ticks = 1): Promise<void> {
      await pic.startCanister({ canisterId });
      await time.produceBlocks(ticks);
    },
    async restartCanister(canisterId: Principal, ticks = 1): Promise<void> {
      await pic.stopCanister({ canisterId });
      await pic.startCanister({ canisterId });
      await time.produceBlocks(ticks);
    },
    async withStoppedCanister<R>(
      canisterId: Principal,
      fn: () => R | Promise<R>,
      ticksAfterStart = 1,
    ): Promise<R> {
      await pic.stopCanister({ canisterId });
      try {
        return await fn();
      } finally {
        await pic.startCanister({ canisterId });
        await time.produceBlocks(ticksAfterStart);
      }
    },
    async tearDown(): Promise<void> {
      await pic.tearDown();
    },
  };
}

export async function passTime(
  pic: PocketIc,
  millis: number,
  ticks = 2,
): Promise<void> {
  await new TimeDriver(pic).advanceMs(millis, { ticks });
}

export function variantKey(value: unknown): string {
  if (value === null || typeof value !== "object") {
    throw new Error(`expected variant object, got ${String(value)}`);
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    throw new Error(`expected one variant key, got ${JSON.stringify(value)}`);
  }
  return keys[0];
}

export function unwrapVariant<T = unknown>(value: unknown, key: string): T {
  if (variantKey(value) !== key) {
    throw new Error(`expected #${key}, got ${JSON.stringify(value)}`);
  }
  return (value as Record<string, T>)[key];
}

export function unwrapOk<T = unknown>(value: unknown): T {
  return unwrapVariant<T>(value, "ok");
}

export function unwrapIcrcOk<T = unknown>(value: unknown): T {
  return unwrapVariant<T>(value, "Ok");
}
