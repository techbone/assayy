import type { Ratio } from "./amount";

export type MarketSession = "open" | "closed" | "unknown";
export type OraclePrice = {
  id: string;
  usd: Ratio;
  confidenceUsd: Ratio;
  publishedAt: number;
};
export type Exposure = {
  // Raw token units -> whole tokens -> display units -> economic share equivalents.
  decimals: number;
  displayMultiplier: Ratio;
  sharesPerDisplayUnit: Ratio;
  nextMultiplier?: { value: Ratio; effectiveAt: number };
  verified: boolean;
  verifiedUntil: number;
  source: string;
};
export type Wrapper = {
  id: string;
  label: string;
  issuer: string;
  mint: string;
  exposure: Exposure;
};
export type Quote = {
  wrapperId: string;
  inputRaw: bigint;
  outputRaw: bigint;
  minimumOutputRaw: bigint;
  networkFeeUsd: Ratio;
  quotedAt: number;
  expiresAt: number;
  // Observations from separate quotes may share liquidity. Plans must be re-quoted.
  poolIds: readonly string[];
};
