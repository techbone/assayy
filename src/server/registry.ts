import "server-only";
import { EXTENSION } from "../domain/mint";

export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export type VerifiedWrapper = {
  id: string;
  label: string;
  issuer: string;
  mint: string;
  decimals: number;
  metadataSymbol: string;
  /** Exact extension set observed at admission. Any change fails closed until reviewed. */
  extensions: readonly number[];
  /** Issuer documents: mint identity, then shares = raw / 10^decimals x active multiplier. */
  evidence: readonly string[];
};
export type VerifiedAsset = {
  ticker: string;
  name: string;
  wrappers: readonly [VerifiedWrapper, VerifiedWrapper];
};

const common = [
  EXTENSION.metadataPointer,
  EXTENSION.tokenMetadata,
  EXTENSION.defaultAccountState,
  EXTENSION.scaledUiAmount,
  EXTENSION.pausable,
  EXTENSION.confidentialTransferMint,
  EXTENSION.transferHook,
];

/** Admitted September 24, 2026 after docs/ASSET_VERIFICATION.md review; see docs/VALIDATION.md.
 * No Pyth feed is admitted: fair-value premium stays unavailable until access is verified.
 */
export const verifiedAssets: readonly VerifiedAsset[] = [
  {
    ticker: "AAPL",
    name: "Apple",
    wrappers: [
      {
        id: "x",
        label: "AAPLx",
        issuer: "xStocks · Backed",
        mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
        decimals: 8,
        metadataSymbol: "AAPLx",
        extensions: [...common, EXTENSION.permanentDelegate],
        evidence: [
          "https://www.lb.lt/uploads/prospectuses/docs/56851_d75fd29bdc01e77344e458eb95100611.pdf",
          "https://docs.xstocks.fi/developers/multipliers",
        ],
      },
      {
        id: "on",
        label: "AAPLon",
        issuer: "Ondo Global Markets",
        mint: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo",
        decimals: 9,
        metadataSymbol: "AAPLon",
        extensions: common,
        evidence: [
          "https://github.com/ondoprotocol/gm-solana-simulator/blob/main/constants.rs",
          "https://docs.ondo.finance/ondo-global-markets/token-and-quote-pricing",
        ],
      },
    ],
  },
];
export const findAsset = (ticker: string) =>
  verifiedAssets.find((asset) => asset.ticker === ticker);
