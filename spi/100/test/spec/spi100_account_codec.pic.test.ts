import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  Principal,
  stopPocketIcServer,
} from "../../../../shared/common/runtime.ts";
import {
  accountBelongsToWallet,
  base58Decode,
  base58Encode,
  crc32,
  decodeSpi100Account,
  decodeSpi100Text,
  encodeSpi100Account,
  encodeSpi100Text,
  spi100AccountToText,
  SPI100_MAX_ID,
} from "../../../../shared/common/spi100.ts";
import { setupSpi100E2E, type Spi100E2E } from "./spi100TestEnv.ts";

type Opt<T> = [] | [T];

const VECTOR_WALLET = Principal.fromText("togwv-zqaaa-aaaal-qr7aa-cai");
const VECTOR_ID = 123n;
const VECTOR_ACCOUNT = [0x50, 0x01, 0x70, 0x8f, 0xc0, 0x01, 0x01, 0x7b];
const VECTOR_TEXT = "n2WZtE3RDcCuoZD8Ax";

describe("SPI-100 TypeScript account codec", () => {
  test("matches the canonical spec vector", () => {
    const account = encodeSpi100Account(VECTOR_WALLET, VECTOR_ID);
    expect(bytes(account)).toEqual(VECTOR_ACCOUNT);
    expect(encodeSpi100Text(account!)).toBe(VECTOR_TEXT);
    expect(spi100AccountToText(VECTOR_WALLET, VECTOR_ID)).toBe(VECTOR_TEXT);

    const decoded = decodeSpi100Account(account!);
    expect(decoded?.wallet.toText()).toBe(VECTOR_WALLET.toText());
    expect(decoded?.id).toBe(VECTOR_ID);
    expect(bytes(decodeSpi100Text(VECTOR_TEXT))).toEqual(VECTOR_ACCOUNT);
    expect(accountBelongsToWallet(account!, VECTOR_WALLET)).toBe(true);
  });

  test("uses minimal big-endian id lengths at every boundary", () => {
    const cases: Array<[bigint, number[]]> = [
      [0n, [0x00]],
      [255n, [0xff]],
      [256n, [0x01, 0x00]],
      [65_535n, [0xff, 0xff]],
      [65_536n, [0x01, 0x00, 0x00]],
      [16_777_215n, [0xff, 0xff, 0xff]],
      [16_777_216n, [0x01, 0x00, 0x00, 0x00]],
      [SPI100_MAX_ID, [0xff, 0xff, 0xff, 0xff]],
    ];

    for (const [id, idBytes] of cases) {
      const account = encodeSpi100Account(VECTOR_WALLET, id);
      expect(account).not.toBeNull();
      expect(bytes(account).slice(-idBytes.length)).toEqual(idBytes);
      expect(decodeSpi100Account(account!)?.id).toBe(id);
    }
  });

  test("trims only leading principal zeros and preserves trailing bytes", () => {
    const wallet = Principal.fromUint8Array(Uint8Array.of(0, 0, 5, 0));
    const account = encodeSpi100Account(wallet, 1n);
    expect(bytes(account)).toEqual([0x20, 0x05, 0x00, 0x01]);

    const decoded = decodeSpi100Account(account!);
    expect(bytes(decoded?.wallet.toUint8Array())).toEqual([0, 0, 5, 0]);
    expect(decoded?.id).toBe(1n);
  });

  test("rejects non-canonical accounts and malformed text ids", () => {
    expect(encodeSpi100Account(VECTOR_WALLET, SPI100_MAX_ID + 1n)).toBeNull();
    expect(decodeSpi100Account([0x51, 0x01, 0x70, 0x8f, 0xc0, 0x01, 0x01, 0x00, 0x7b])).toBeNull();
    expect(decodeSpi100Account([0x18, 0x00, 0x01, 0x01])).toBeNull();
    expect(decodeSpi100Text("x2WZtE3RDcCuoZD8Ax")).toBeNull();
    expect(decodeSpi100Text("n0")).toBeNull();
    expect(decodeSpi100Text(VECTOR_TEXT.slice(0, -1) + "B")).toBeNull();
  });

  test("matches Bitcoin Base58 and Motoko CRC32 behavior", () => {
    const sample = [0, 0, 1, 2, 3, 255];
    const encoded = base58Encode(sample);
    expect(bytes(base58Decode(encoded))).toEqual(sample);
    expect(base58Decode("0")).toBeNull();
    expect(crc32([97, 98, 99])).toBe(891_568_578);
  });
});

describe("SPI-100 canister module compatibility", () => {
  let env: Spi100E2E | undefined;

  afterEach(async () => {
    await env?.runtime.tearDown();
    env = undefined;
  });

  afterAll(async () => {
    await stopPocketIcServer();
  });

  test("actor binary and text codecs match the TypeScript client codec", async () => {
    env = await setupSpi100E2E();
    const actor = env.accountCodec.actor;

    const account = expectSome<Uint8Array>(
      await actor.spi_100_encode(VECTOR_WALLET, VECTOR_ID),
    );
    expect(bytes(account)).toEqual(VECTOR_ACCOUNT);
    expect(bytes(account)).toEqual(bytes(encodeSpi100Account(VECTOR_WALLET, VECTOR_ID)));

    const decoded = expectSome<{ wallet: Principal; id: bigint }>(
      await actor.spi_100_decode(account),
    );
    expect(decoded.wallet.toText()).toBe(VECTOR_WALLET.toText());
    expect(decoded.id).toBe(VECTOR_ID);

    expect(expectSome<Principal>(await actor.spi_100_account_wallet(account)).toText()).toBe(
      VECTOR_WALLET.toText(),
    );
    expect(expectSome<bigint>(await actor.spi_100_account_id(account))).toBe(VECTOR_ID);
    expect(await actor.spi_100_belongs_to_wallet(account, VECTOR_WALLET)).toBe(true);
    expect(await actor.spi_100_belongs_to_wallet(account, env.bob.getPrincipal())).toBe(false);

    expect(expectSome<string>(await actor.spi_100_text_encode(account))).toBe(VECTOR_TEXT);
    expect(bytes(expectSome<Uint8Array>(await actor.spi_100_text_decode(VECTOR_TEXT)))).toEqual(
      VECTOR_ACCOUNT,
    );
  });

  test("actor Base58 and rejection behavior match the TypeScript client codec", async () => {
    env = await setupSpi100E2E();
    const actor = env.accountCodec.actor;
    const sample = Uint8Array.of(0, 0, 1, 2, 3, 255);
    const encoded = base58Encode(sample);

    expect(await actor.spi_100_base58_encode(sample)).toBe(encoded);
    expect(bytes(expectSome<Uint8Array>(await actor.spi_100_base58_decode(encoded)))).toEqual(
      bytes(sample),
    );
    expectNone(await actor.spi_100_base58_decode("0"));
    expectNone(await actor.spi_100_decode(Uint8Array.of(0x51, 0x01, 0x70, 0x8f, 0xc0, 0x01, 0x01, 0x00, 0x7b)));
    expectNone(await actor.spi_100_text_decode(VECTOR_TEXT.slice(0, -1) + "B"));
  });
});

function bytes(value: Uint8Array | number[] | ArrayBuffer | null | undefined): number[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
}

function expectSome<T>(opt: Opt<T>): T {
  expect(opt).toHaveLength(1);
  return opt[0] as T;
}

function expectNone<T>(opt: Opt<T>): void {
  expect(opt).toEqual([]);
}
