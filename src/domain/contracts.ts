import { z } from "zod";
import { parseUnits } from "./amount";
import type { MarketSession } from "./types";

export const comparisonRequest = z
  .object({
    // Syntax only; demo fixtures and the live registry decide which tickers exist.
    ticker: z.string().regex(/^[A-Z]{1,6}$/, "Unknown ticker"),
    amount: z
      .string()
      .max(24)
      .refine((value) => {
        try {
          const raw = parseUnits(value, 6);
          return raw >= 1_000_000n && raw <= 250_000_000_000n;
        } catch {
          return false;
        }
      }, "Enter between 1 and 250,000 USDC, with at most six decimal places"),
    scenario: z
      .enum(["normal", "closed", "stale", "wide-confidence"])
      .default("normal"),
  })
  .strict();
export type ComparisonRequest = z.infer<typeof comparisonRequest>;
export type ComparisonWrapper = {
  id: string;
  label: string;
  issuer: string;
  status: "quoted" | "unavailable";
  shares: string | null;
  /** Full-order USDC per share equivalent. */
  pricePerShare: string | null;
  /** Versus the fair-value reference; null without a verified oracle. */
  premiumBps: string | null;
  /** Versus the cheapest quoted wrapper for the same full order. */
  spreadBps: string | null;
  allocation: string;
  router: string | null;
  multiplier: string | null;
  mint: string | null;
};
export type Comparison = {
  mode: "demo" | "live";
  ticker: string;
  amount: string;
  generatedAt: number;
  expiresAt: number;
  session: MarketSession;
  reference: {
    price: string;
    publishedAt: number;
    confidenceBps: string;
  } | null;
  wrappers: ComparisonWrapper[];
  plan: {
    shares: string;
    baselineShares: string;
    baselineLabel: string;
    improvementShares: string;
    improvementUsd: string;
    feeUsd: string;
    edge: { versus: string; shares: string; usd: string } | null;
    candidates: number;
    sharedLiquidity: boolean;
    legs: { label: string; amount: string; shares: string }[];
  };
  source: { slot: number | null; quotes: number };
  execution: { enabled: false; reasons: string[] };
};
