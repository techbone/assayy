import { divide, multiply, parseUnits, ratio } from "../domain/amount";
import type { Comparison, ComparisonRequest } from "../domain/contracts";
import { assessQuote } from "../domain/guard";
import { normalizeShares } from "../domain/normalization";
import { allocationGrid, optimize } from "../domain/optimizer";
import { presentComparison } from "../domain/present";
import type { OraclePrice, Quote, Wrapper } from "../domain/types";

export const DEMO_STOCKS = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "NVDA", name: "NVIDIA" },
] as const;

/** Synthetic curves only. These are not recorded or live market prices. */
export function demoComparison(
  request: ComparisonRequest,
  now = Math.floor(Date.now() / 1000),
): Comparison {
  const total = parseUnits(request.amount, 6);
  const fairPrice = request.ticker === "AAPL" ? 200n : 150n;
  const session = request.scenario === "closed" ? "closed" : "open";
  const equity: OraclePrice = {
    id: `fixture:${request.ticker}`,
    usd: ratio(fairPrice),
    confidenceUsd:
      request.scenario === "wide-confidence" ? ratio(5n) : ratio(1n, 100n),
    publishedAt:
      now - (request.scenario === "stale" || session === "closed" ? 7200 : 2),
  };
  const usdc: OraclePrice = {
    id: "fixture:USDC",
    usd: ratio(1n),
    confidenceUsd: ratio(1n, 10_000n),
    publishedAt: now - 1,
  };
  const wrappers: Wrapper[] = [
    {
      id: "x",
      label: `${request.ticker}x`,
      issuer: "xStocks",
      mint: "fixture:x",
      exposure: {
        decimals: 8,
        displayMultiplier: ratio(1002n, 1000n),
        sharesPerDisplayUnit: ratio(1n),
        verified: true,
        verifiedUntil: now + 60,
        source: "synthetic fixture",
      },
    },
    {
      id: "on",
      label: `${request.ticker}on`,
      issuer: "Ondo",
      mint: "fixture:on",
      exposure: {
        decimals: 8,
        displayMultiplier: ratio(1n),
        sharesPerDisplayUnit: ratio(1015n, 1000n),
        verified: true,
        verifiedUntil: now + 60,
        source: "synthetic fixture",
      },
    },
  ];
  const quotes: Quote[] = [];
  // Full cumulative quote at each allocation, not a sum of independent small swaps.
  const firstAllocations = allocationGrid(total);
  for (const [index, wrapper] of wrappers.entries()) {
    const allocations =
      index === 0 ? firstAllocations : firstAllocations.map((a) => total - a);
    for (const inputRaw of new Set(allocations.filter((value) => value > 0n))) {
      const impactBps =
        (index === 0 ? 10n : 20n) +
        (inputRaw * (index === 0 ? 400n : 250n)) / 250_000_000_000n;
      const price = multiply(
        ratio(fairPrice),
        ratio(10_000n + impactBps, 10_000n),
      );
      const shares = divide(ratio(inputRaw, 1_000_000n), price);
      const rawShares = normalizeShares(100_000_000n, wrapper.exposure, now);
      const tokens = divide(shares, rawShares);
      const outputRaw = (tokens.n * 100_000_000n) / tokens.d;
      quotes.push({
        wrapperId: wrapper.id,
        inputRaw,
        outputRaw,
        minimumOutputRaw: (outputRaw * 9970n) / 10_000n,
        networkFeeUsd: ratio(1n, 100n),
        quotedAt: now,
        expiresAt: now + 20,
        poolIds: [`fixture:pool:${index}`],
      });
    }
  }
  const result = optimize({
    total,
    wrappers,
    quotes,
    shareValueUsd: equity.usd,
    now,
  });
  const guardReasons = result.best.legs.flatMap(
    (quote) =>
      assessQuote({
        quote,
        wrapper: wrappers.find((w) => w.id === quote.wrapperId)!,
        equity,
        usdc,
        session,
        now,
      }).reasons,
  );
  return presentComparison({
    mode: "demo",
    ticker: request.ticker,
    total,
    now,
    expiresAt: now + 20,
    session,
    reference: equity,
    wrappers,
    quotes,
    result,
    reasons: ["Synthetic demo data — no wallet transactions", ...guardReasons],
  });
}
