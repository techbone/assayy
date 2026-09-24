const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 decode for 32-byte Solana addresses. Throws on invalid input. */
export function decodeAddress(address: string): Uint8Array {
  let value = 0n;
  for (const char of address) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error("Invalid base58 address");
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const char of address) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  if (bytes.length !== 32) throw new Error("Address must be 32 bytes");
  return Uint8Array.from(bytes);
}

function compactU16(data: Uint8Array, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 3; i++) {
    const byte = data[offset + i];
    if (byte === undefined) throw new Error("Transaction truncated");
    value |= (byte & 0x7f) << (7 * i);
    if (!(byte & 0x80)) return [value, offset + i + 1];
  }
  throw new Error("Invalid compact length");
}

/** Accounts that must sign a legacy or v0 transaction (the first N static keys). */
export function requiredSigners(transaction: Uint8Array): Uint8Array[] {
  let [signatures, offset] = compactU16(transaction, 0);
  offset += signatures * 64;
  if ((transaction[offset] ?? 0) & 0x80) offset += 1; // versioned message prefix
  const required = transaction[offset];
  if (required === undefined || required === 0 || required > signatures)
    throw new Error("Invalid message header");
  let keys: number;
  [keys, offset] = compactU16(transaction, offset + 3);
  if (keys < required || offset + keys * 32 > transaction.length)
    throw new Error("Transaction truncated");
  return Array.from({ length: required }, (_, i) =>
    transaction.subarray(offset + i * 32, offset + (i + 1) * 32),
  );
}

export function isRequiredSigner(transaction: Uint8Array, address: string) {
  const key = decodeAddress(address);
  return requiredSigners(transaction).some((signer) =>
    signer.every((byte, i) => byte === key[i]),
  );
}
