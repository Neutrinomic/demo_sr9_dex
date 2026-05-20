import { Principal } from "./runtime.ts";

export type Spi100Id = bigint;

export type Spi100Decoded = {
  id: Spi100Id;
  scope: Principal;
};

export type Spi100ControlInfo = {
  controller: Principal;
  id: Spi100Id | null;
};

export const SPI100_RESERVED_CLASS = 0x7f;
export const SPI100_ANONYMOUS_CLASS = 0x04;
export const SPI100_ID_BYTES = 4;
export const SPI100_MAX_ID = 0xffff_ffffn;
export const SPI100_MAX_EMBEDDED_PRINCIPAL_BYTES = 24;
export const SPI100_MAX_PRINCIPAL_BYTES = 29;

export function encodeSpi100(
  scope: Principal,
  id: number | bigint,
): Principal | null {
  const normalizedId = normalizeSpi100Id(id);
  if (normalizedId === null || !isUsableSpi100Scope(scope)) {
    return null;
  }

  const scopeBytes = scope.toUint8Array();
  const bytes = new Uint8Array(scopeBytes.length + SPI100_ID_BYTES + 1);
  bytes.set(scopeBytes, 0);
  bytes[scopeBytes.length] = Number((normalizedId >> 24n) & 0xffn);
  bytes[scopeBytes.length + 1] = Number((normalizedId >> 16n) & 0xffn);
  bytes[scopeBytes.length + 2] = Number((normalizedId >> 8n) & 0xffn);
  bytes[scopeBytes.length + 3] = Number(normalizedId & 0xffn);
  bytes[scopeBytes.length + 4] = SPI100_RESERVED_CLASS;
  return Principal.fromUint8Array(bytes);
}

export const encodeScopedPrincipal = encodeSpi100;

export function decodeSpi100(principal: Principal): Spi100Decoded | null {
  const bytes = principal.toUint8Array();
  if (
    bytes.length <= SPI100_ID_BYTES + 1 ||
    bytes.length > SPI100_MAX_PRINCIPAL_BYTES ||
    bytes[bytes.length - 1] !== SPI100_RESERVED_CLASS
  ) {
    return null;
  }

  const scopeLength = bytes.length - SPI100_ID_BYTES - 1;
  if (
    scopeLength === 0 ||
    scopeLength > SPI100_MAX_EMBEDDED_PRINCIPAL_BYTES
  ) {
    return null;
  }

  let scope: Principal;
  try {
    scope = Principal.fromUint8Array(bytes.slice(0, scopeLength));
  } catch {
    return null;
  }
  if (!isUsableSpi100Scope(scope)) {
    return null;
  }

  const id =
    (BigInt(bytes[scopeLength]) << 24n) |
    (BigInt(bytes[scopeLength + 1]) << 16n) |
    (BigInt(bytes[scopeLength + 2]) << 8n) |
    BigInt(bytes[scopeLength + 3]);
  return { id, scope };
}

export const decodeScopedPrincipal = decodeSpi100;

export function resolveSpi100Control(
  principal: Principal,
): Spi100ControlInfo | null {
  const decoded = decodeSpi100(principal);
  if (decoded !== null) {
    return {
      controller: decoded.scope,
      id: decoded.id,
    };
  }
  if (!isDirectPrincipal(principal)) {
    return null;
  }
  return {
    controller: principal,
    id: null,
  };
}

export function authorizeSpi100(
  caller: Principal,
  principal: Principal,
): Spi100ControlInfo | null {
  if (!isDirectPrincipal(caller)) {
    return null;
  }
  const resolved = resolveSpi100Control(principal);
  if (resolved === null || !principalEqual(resolved.controller, caller)) {
    return null;
  }
  return resolved;
}

export function canControlSpi100(
  caller: Principal,
  principal: Principal,
): boolean {
  return authorizeSpi100(caller, principal) !== null;
}

export function isReservedPrincipal(principal: Principal): boolean {
  const bytes = principal.toUint8Array();
  return bytes.length > 0 && bytes[bytes.length - 1] === SPI100_RESERVED_CLASS;
}

export function isAnonymousPrincipal(principal: Principal): boolean {
  const bytes = principal.toUint8Array();
  return bytes.length === 1 && bytes[0] === SPI100_ANONYMOUS_CLASS;
}

export function isUsableSpi100Scope(principal: Principal): boolean {
  const size = principal.toUint8Array().length;
  return (
    size > 0 &&
    size <= SPI100_MAX_EMBEDDED_PRINCIPAL_BYTES &&
    !isAnonymousPrincipal(principal) &&
    !isReservedPrincipal(principal)
  );
}

export function isDirectPrincipal(principal: Principal): boolean {
  const size = principal.toUint8Array().length;
  return (
    size > 0 &&
    !isAnonymousPrincipal(principal) &&
    !isReservedPrincipal(principal)
  );
}

export function principalEqual(left: Principal, right: Principal): boolean {
  return left.compareTo(right) === "eq";
}

function normalizeSpi100Id(id: number | bigint): bigint | null {
  if (typeof id === "number") {
    if (!Number.isSafeInteger(id) || id < 0) {
      return null;
    }
  }
  const value = BigInt(id);
  return value >= 0n && value <= SPI100_MAX_ID ? value : null;
}
