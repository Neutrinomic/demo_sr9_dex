import { Principal } from "@icp-sdk/core/principal";

export type Spi100Account = Uint8Array;

export type Spi100DecodedAccount = {
  wallet: Principal;
  id: bigint;
};

export type Spi100BytesInput = ArrayBuffer | Uint8Array | number[];

export const SPI100_MAX_ID = 0xffff_ffffn;
export const SPI100_MAX_PRINCIPAL_BYTES = 29;
export const SPI100_MAX_ID_BYTES = 4;
export const SPI100_TEXT_PREFIX = "n";
export const SPI100_TEXT_CHECKSUM_BYTES = 4;
export const SPI100_BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const BASE58_VALUES = new Map<string, number>(
  [...SPI100_BASE58_ALPHABET].map((char, index) => [char, index]),
);

const CRC32_TABLE = makeCrc32Table();

export function encodeSpi100Account(
  wallet: Principal,
  id: number | bigint,
): Spi100Account | null {
  const normalizedId = normalizeSpi100LocalId(id);
  if (normalizedId === null || !isUsableSpi100Wallet(wallet)) {
    return null;
  }

  const principalBytes = principalBytesOf(wallet);
  const idBytes = encodeMinimalIdBytes(normalizedId);
  const principalLen = principalBytes.length;
  const zeroPrefix = leadingZeroBytes(principalBytes);
  const suffix = principalBytes.slice(zeroPrefix);
  const header = principalLen * 8 + (idBytes.length - 1);

  const account = new Uint8Array(1 + suffix.length + idBytes.length);
  account[0] = header;
  account.set(suffix, 1);
  account.set(idBytes, 1 + suffix.length);
  return account;
}

export const encodeSpi100 = encodeSpi100Account;
export const encodeSpi100Subject = encodeSpi100Account;

export function decodeSpi100Account(
  accountInput: Spi100BytesInput,
): Spi100DecodedAccount | null {
  const account = normalizeBytes(accountInput);
  if (account === null || account.length < 2) {
    return null;
  }

  const header = account[0];
  const principalLen = Math.floor(header / 8);
  const idLen = (header % 8) + 1;
  if (
    principalLen === 0 ||
    principalLen > SPI100_MAX_PRINCIPAL_BYTES ||
    idLen > SPI100_MAX_ID_BYTES ||
    account.length <= idLen
  ) {
    return null;
  }

  const suffixLen = account.length - 1 - idLen;
  if (suffixLen > principalLen) {
    return null;
  }
  if (suffixLen > 0 && account[1] === 0) {
    return null;
  }

  const principalBytes = new Uint8Array(principalLen);
  principalBytes.set(account.slice(1, 1 + suffixLen), principalLen - suffixLen);

  let wallet: Principal;
  try {
    wallet = Principal.fromUint8Array(principalBytes);
  } catch {
    return null;
  }
  if (!isUsableSpi100Wallet(wallet)) {
    return null;
  }

  const id = readBigEndian(account.slice(1 + suffixLen));
  if (id > SPI100_MAX_ID || minimalIdByteLength(id) !== idLen) {
    return null;
  }
  return { wallet, id };
}

export const decodeSpi100 = decodeSpi100Account;

export function encodeSpi100Text(accountInput: Spi100BytesInput): string | null {
  const account = normalizeBytes(accountInput);
  if (account === null || decodeSpi100Account(account) === null) {
    return null;
  }
  return SPI100_TEXT_PREFIX + base58Encode(appendChecksum(account));
}

export const encodeSpi100AccountText = encodeSpi100Text;

export function decodeSpi100Text(text: string): Spi100Account | null {
  if (!text.startsWith(SPI100_TEXT_PREFIX) || text.length <= 1) {
    return null;
  }
  const decoded = base58Decode(text.slice(SPI100_TEXT_PREFIX.length));
  if (decoded === null || decoded.length <= SPI100_TEXT_CHECKSUM_BYTES) {
    return null;
  }

  const payloadEnd = decoded.length - SPI100_TEXT_CHECKSUM_BYTES;
  const payload = decoded.slice(0, payloadEnd);
  const actual = readNat32BE(decoded, payloadEnd);
  const expected = crc32(payload);
  if (actual !== expected || decodeSpi100Account(payload) === null) {
    return null;
  }
  return payload;
}

export const decodeSpi100AccountText = decodeSpi100Text;

export function spi100AccountToText(
  wallet: Principal,
  id: number | bigint,
): string | null {
  const account = encodeSpi100Account(wallet, id);
  return account === null ? null : encodeSpi100Text(account);
}

export function accountBelongsToWallet(
  account: Spi100BytesInput,
  wallet: Principal,
): boolean {
  const decoded = decodeSpi100Account(account);
  return decoded !== null && principalEqual(decoded.wallet, wallet);
}

export function isCanonicalSpi100Account(account: Spi100BytesInput): boolean {
  return decodeSpi100Account(account) !== null;
}

export function isUsableSpi100Wallet(wallet: Principal): boolean {
  const size = principalBytesOf(wallet).length;
  return size > 0 && size <= SPI100_MAX_PRINCIPAL_BYTES;
}

export function principalEqual(left: Principal, right: Principal): boolean {
  return left.compareTo(right) === "eq";
}

export function base58Encode(input: Spi100BytesInput): string {
  const bytes = normalizeBytes(input);
  if (bytes === null) {
    throw new Error("base58Encode expects bytes.");
  }

  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros += 1;
  }

  let value = 0n;
  for (const byte of bytes) {
    value = value * 256n + BigInt(byte);
  }

  let encoded = "";
  while (value > 0n) {
    const digit = Number(value % 58n);
    encoded = SPI100_BASE58_ALPHABET[digit] + encoded;
    value /= 58n;
  }
  return "1".repeat(leadingZeros) + encoded;
}

export function base58Decode(text: string): Spi100Account | null {
  if (text.length === 0) {
    return null;
  }

  let leadingZeros = 0;
  while (leadingZeros < text.length && text[leadingZeros] === "1") {
    leadingZeros += 1;
  }

  let value = 0n;
  for (let i = leadingZeros; i < text.length; i += 1) {
    const digit = BASE58_VALUES.get(text[i]);
    if (digit === undefined) {
      return null;
    }
    value = value * 58n + BigInt(digit);
  }

  const valueBytes: number[] = [];
  while (value > 0n) {
    valueBytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }

  const out = new Uint8Array(leadingZeros + valueBytes.length);
  out.set(valueBytes, leadingZeros);
  return out;
}

export function crc32(input: Spi100BytesInput): number {
  const bytes = normalizeBytes(input);
  if (bytes === null) {
    throw new Error("crc32 expects bytes.");
  }

  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (~crc) >>> 0;
}

export function normalizeSpi100LocalId(id: number | bigint): bigint | null {
  if (typeof id === "number" && (!Number.isSafeInteger(id) || id < 0)) {
    return null;
  }
  const value = BigInt(id);
  return value >= 0n && value <= SPI100_MAX_ID ? value : null;
}

function principalBytesOf(principal: Principal): Uint8Array {
  return new Uint8Array(principal.toUint8Array());
}

function normalizeBytes(input: Spi100BytesInput): Uint8Array | null {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (input instanceof Uint8Array) {
    return new Uint8Array(input);
  }

  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const byte = input[i];
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      return null;
    }
    out[i] = byte;
  }
  return out;
}

function leadingZeroBytes(bytes: Uint8Array): number {
  let count = 0;
  while (count < bytes.length && bytes[count] === 0) {
    count += 1;
  }
  return count;
}

function minimalIdByteLength(id: bigint): number {
  if (id <= 0xffn) {
    return 1;
  }
  if (id <= 0xffffn) {
    return 2;
  }
  if (id <= 0xff_ffffn) {
    return 3;
  }
  return 4;
}

function encodeMinimalIdBytes(id: bigint): Uint8Array {
  const length = minimalIdByteLength(id);
  const out = new Uint8Array(length);
  let value = id;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

function readBigEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = value * 256n + BigInt(byte);
  }
  return value;
}

function appendChecksum(account: Uint8Array): Uint8Array {
  const checksum = crc32(account);
  const out = new Uint8Array(account.length + SPI100_TEXT_CHECKSUM_BYTES);
  out.set(account, 0);
  out[account.length] = (checksum >>> 24) & 0xff;
  out[account.length + 1] = (checksum >>> 16) & 0xff;
  out[account.length + 2] = (checksum >>> 8) & 0xff;
  out[account.length + 3] = checksum & 0xff;
  return out;
}

function readNat32BE(bytes: Uint8Array, start: number): number {
  return (
    bytes[start] * 16_777_216 +
    bytes[start + 1] * 65_536 +
    bytes[start + 2] * 256 +
    bytes[start + 3]
  ) >>> 0;
}

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = value & 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
}
