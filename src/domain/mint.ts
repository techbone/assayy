import { ratio, type Ratio } from "./amount";

/** Token-2022 extension type discriminants used by the admitted mints. */
export const EXTENSION = {
  confidentialTransferMint: 4,
  defaultAccountState: 6,
  permanentDelegate: 12,
  transferHook: 14,
  metadataPointer: 18,
  tokenMetadata: 19,
  scaledUiAmount: 25,
  pausable: 26,
} as const;

export type DecodedMint = {
  decimals: number;
  initialized: boolean;
  extensions: number[];
  scaledUi?: { multiplier: Ratio; newMultiplier: Ratio; effectiveAt: number };
  paused?: boolean;
  transferHookProgramSet?: boolean;
  metadata?: { name: string; symbol: string };
};

/** Exact value of an IEEE-754 binary64. Multipliers are never rounded through JS numbers. */
export function f64Ratio(bits: bigint): Ratio {
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  if (bits >> 63n || exponent === 0x7ff)
    throw new Error("Multiplier must be finite and non-negative");
  if (exponent === 0 && fraction === 0n) return ratio(0n);
  let mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  let shift = (exponent === 0 ? 1 : exponent) - 1075;
  // Reduce powers of two so later share arithmetic keeps small operands.
  while (shift < 0 && (mantissa & 1n) === 0n) {
    mantissa >>= 1n;
    shift++;
  }
  return shift >= 0
    ? ratio(mantissa << BigInt(shift))
    : ratio(mantissa, 1n << BigInt(-shift));
}

const BASE_MINT_LENGTH = 82;
const ACCOUNT_TYPE_OFFSET = 165;

/** Decodes a Token-2022 mint account. Malformed or truncated data throws; callers fail closed. */
export function decodeMint(data: Uint8Array): DecodedMint {
  if (data.length < BASE_MINT_LENGTH) throw new Error("Mint data truncated");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const mint: DecodedMint = {
    decimals: data[44]!,
    initialized: data[45] === 1,
    extensions: [],
  };
  if (data.length === BASE_MINT_LENGTH) return mint;
  if (data.length <= ACCOUNT_TYPE_OFFSET || data[ACCOUNT_TYPE_OFFSET] !== 1)
    throw new Error("Not a Token-2022 mint account");
  let offset = ACCOUNT_TYPE_OFFSET + 1;
  while (offset + 4 <= data.length) {
    const type = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    const start = offset + 4;
    if (type === 0) break;
    if (start + length > data.length) throw new Error("Extension truncated");
    mint.extensions.push(type);
    if (type === EXTENSION.scaledUiAmount) {
      if (length !== 56) throw new Error("Unexpected scaled UI layout");
      mint.scaledUi = {
        multiplier: f64Ratio(view.getBigUint64(start + 32, true)),
        effectiveAt: Number(view.getBigInt64(start + 40, true)),
        newMultiplier: f64Ratio(view.getBigUint64(start + 48, true)),
      };
    } else if (type === EXTENSION.pausable) {
      if (length !== 33) throw new Error("Unexpected pausable layout");
      mint.paused = data[start + 32] !== 0;
    } else if (type === EXTENSION.transferHook) {
      if (length !== 64) throw new Error("Unexpected transfer hook layout");
      mint.transferHookProgramSet = data
        .subarray(start + 32, start + 64)
        .some((byte) => byte !== 0);
    } else if (type === EXTENSION.tokenMetadata) {
      const text = new TextDecoder("utf-8", { fatal: true });
      let cursor = start + 64;
      const read = () => {
        const size = view.getUint32(cursor, true);
        if (cursor + 4 + size > start + length)
          throw new Error("Metadata truncated");
        const value = text.decode(data.subarray(cursor + 4, cursor + 4 + size));
        cursor += 4 + size;
        return value;
      };
      mint.metadata = { name: read(), symbol: read() };
    }
    offset = start + length;
  }
  return mint;
}
