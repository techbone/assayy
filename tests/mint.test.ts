import { describe, expect, it } from "vitest";
import { format, type Ratio } from "../src/domain/amount";
import { decodeMint, EXTENSION, f64Ratio } from "../src/domain/mint";
import { AAPLON_MINT_BASE64, AAPLX_MINT_BASE64 } from "./fixtures/mints";

const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
// A 24-digit truncation parses back to the same binary64 only if decoding was exact.
const asDouble = (value: Ratio) => Number(format(value, 24));
const bitsOf = (value: number) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return view.getBigUint64(0, true);
};

describe("f64 multiplier decoding", () => {
  it("is exact, not rounded through decimal strings", () => {
    expect(f64Ratio(bitsOf(1))).toEqual({ n: 1n, d: 1n });
    expect(f64Ratio(bitsOf(0.5))).toEqual({ n: 1n, d: 2n });
    expect(asDouble(f64Ratio(bitsOf(1.0032690125398187)))).toBe(
      1.0032690125398187,
    );
  });
  it.each([-1, Infinity, NaN])("rejects %s", (value) =>
    expect(() => f64Ratio(bitsOf(value))).toThrow(),
  );
});

describe("captured mainnet Token-2022 mints", () => {
  it("decodes AAPLx scaled UI state, pause flag and metadata", () => {
    const mint = decodeMint(bytes(AAPLX_MINT_BASE64));
    expect(mint).toMatchObject({
      decimals: 8,
      initialized: true,
      paused: false,
      transferHookProgramSet: false,
      metadata: { name: "Apple xStock", symbol: "AAPLx" },
    });
    // Values match the RPC's jsonParsed view of the same slot.
    expect(asDouble(mint.scaledUi!.multiplier)).toBe(1.0026642075893797);
    expect(asDouble(mint.scaledUi!.newMultiplier)).toBe(1.0032690125398187);
    expect(mint.scaledUi!.effectiveAt).toBe(1786149000);
    expect(new Set(mint.extensions)).toEqual(
      new Set([
        EXTENSION.metadataPointer,
        EXTENSION.permanentDelegate,
        EXTENSION.defaultAccountState,
        EXTENSION.scaledUiAmount,
        EXTENSION.pausable,
        EXTENSION.confidentialTransferMint,
        EXTENSION.transferHook,
        EXTENSION.tokenMetadata,
      ]),
    );
  });
  it("decodes AAPLon", () => {
    const mint = decodeMint(bytes(AAPLON_MINT_BASE64));
    expect(mint).toMatchObject({
      decimals: 9,
      paused: false,
      metadata: { name: "Apple (Ondo Tokenized)", symbol: "AAPLon" },
    });
    expect(asDouble(mint.scaledUi!.multiplier)).toBe(1.003376073740221);
    expect(mint.scaledUi!.effectiveAt).toBe(1789754055);
  });
  it("fails closed on truncated or foreign account data", () => {
    const data = bytes(AAPLX_MINT_BASE64);
    expect(() => decodeMint(data.subarray(0, 60))).toThrow();
    expect(() => decodeMint(data.subarray(0, 300))).toThrow();
    const foreign = data.slice();
    foreign[165] = 2;
    expect(() => decodeMint(foreign)).toThrow(/Token-2022 mint/);
  });
});
