import { compare, divide, multiply, ratio, subtract } from "./amount";
import { normalizeShares } from "./normalization";
import type { MarketSession, OraclePrice, Quote, Wrapper } from "./types";

export const DEFAULT_POLICY = {
  maxOracleAgeSeconds: 60,
  maxConfidenceBps: 50,
  maxPremiumBps: 100,
  maxClockSkewSeconds: 5,
  maxQuoteAgeSeconds: 20,
  maxInputRaw: 250_000_000_000n,
} as const;
export type GuardPolicy = {
  [K in keyof typeof DEFAULT_POLICY]: (typeof DEFAULT_POLICY)[K] extends bigint
    ? bigint
    : number;
};

export function oracleIssues(
  price: OraclePrice,
  now: number,
  policy: GuardPolicy,
): string[] {
  const issues: string[] = [];
  if (price.usd.n <= 0n || price.confidenceUsd.n < 0n)
    return ["Invalid oracle price"];
  if (now - price.publishedAt > policy.maxOracleAgeSeconds)
    issues.push("Stale oracle reference");
  if (price.publishedAt - now > policy.maxClockSkewSeconds)
    issues.push("Oracle timestamp is in the future");
  if (
    compare(
      multiply(price.confidenceUsd, ratio(10_000n)),
      multiply(price.usd, ratio(BigInt(policy.maxConfidenceBps))),
    ) > 0
  )
    issues.push("Oracle confidence interval is too wide");
  return issues;
}

export function assessQuote(args: {
  quote: Quote;
  wrapper: Wrapper;
  equity: OraclePrice;
  usdc: OraclePrice;
  session: MarketSession;
  now: number;
  policy?: GuardPolicy;
}): { allowed: boolean; reasons: string[]; premiumBps?: string } {
  const {
    quote,
    wrapper,
    equity,
    usdc,
    session,
    now,
    policy = DEFAULT_POLICY,
  } = args;
  const reasons = [
    ...oracleIssues(equity, now, policy),
    ...oracleIssues(usdc, now, policy),
  ];
  if (session !== "open")
    reasons.push(
      session === "closed"
        ? "Underlying market closed: comparison only"
        : "Market session unknown: comparison only",
    );
  if (quote.wrapperId !== wrapper.id) reasons.push("Quote asset mismatch");
  if (quote.inputRaw <= 0n || quote.inputRaw > policy.maxInputRaw)
    reasons.push("Input is outside the quote limit");
  if (quote.minimumOutputRaw <= 0n || quote.minimumOutputRaw > quote.outputRaw)
    reasons.push("Invalid minimum output");
  if (
    quote.expiresAt <= now ||
    now - quote.quotedAt > policy.maxQuoteAgeSeconds ||
    quote.quotedAt > now + policy.maxClockSkewSeconds
  )
    reasons.push("Quote expired or invalid timestamp");
  if (reasons.length) return { allowed: false, reasons: [...new Set(reasons)] };
  try {
    // Guard the slippage floor, not the optimistic expected output. USDC is not assumed $1.
    const shares = normalizeShares(
      quote.minimumOutputRaw,
      wrapper.exposure,
      now,
      quote.expiresAt,
    );
    const cost = multiply(ratio(quote.inputRaw, 1_000_000n), usdc.usd);
    const worstPrice = divide(cost, shares);
    const premium = multiply(
      subtract(divide(worstPrice, equity.usd), ratio(1n)),
      ratio(10_000n),
    );
    if (compare(premium, ratio(BigInt(policy.maxPremiumBps))) > 0)
      reasons.push("Minimum output breaches the fair-value premium limit");
    return {
      allowed: !reasons.length,
      reasons,
      premiumBps: (premium.n / premium.d).toString(),
    };
  } catch (error) {
    return {
      allowed: false,
      reasons: [
        error instanceof Error ? error.message : "Normalization failed",
      ],
    };
  }
}
