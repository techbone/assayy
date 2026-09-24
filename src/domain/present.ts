import {
  compare,
  divide,
  format,
  multiply,
  ratio,
  subtract,
  type Ratio,
} from "./amount";
import type { Comparison } from "./contracts";
import { activeMultiplier, normalizeShares } from "./normalization";
import type { optimize } from "./optimizer";
import type { MarketSession, OraclePrice, Quote, Wrapper } from "./types";

const bps = (value: Ratio) =>
  format(multiply(subtract(value, ratio(1n)), ratio(10_000n)), 1);

/** Shapes exact results into display strings. Nothing here feeds back into routing. */
export function presentComparison(args: {
  mode: Comparison["mode"];
  ticker: string;
  total: bigint;
  now: number;
  expiresAt: number;
  session: MarketSession;
  reference: OraclePrice | null;
  wrappers: readonly Wrapper[];
  quotes: readonly Quote[];
  routers?: Readonly<Record<string, string>>;
  result: ReturnType<typeof optimize>;
  reasons: readonly string[];
  slot?: number;
}): Comparison {
  const { total, now, reference, wrappers, quotes, result } = args;
  const budget = ratio(total, 1_000_000n);
  const label = (id: string) => wrappers.find((w) => w.id === id)!.label;
  const legShares = (quote: Quote) =>
    normalizeShares(
      quote.outputRaw,
      wrappers.find((w) => w.id === quote.wrapperId)!.exposure,
      now,
    );
  const full = wrappers.map((wrapper) => {
    const quote = quotes.find(
      (q) => q.wrapperId === wrapper.id && q.inputRaw === total,
    );
    const shares = quote && legShares(quote);
    return { wrapper, shares, price: shares && divide(budget, shares) };
  });
  const cheapest = full
    .flatMap((row) => (row.price ? [row.price] : []))
    .sort(compare)[0];
  const quoted = full.filter((row) => row.shares);
  const worst =
    quoted.length > 1
      ? quoted.reduce((a, b) => (compare(a.shares!, b.shares!) <= 0 ? a : b))
      : undefined;
  const edgeShares = worst && subtract(result.best.shares, worst.shares!);
  return {
    mode: args.mode,
    ticker: args.ticker,
    amount: format(budget, 6),
    generatedAt: now,
    expiresAt: args.expiresAt,
    session: args.session,
    reference: reference && {
      price: format(reference.usd),
      publishedAt: reference.publishedAt,
      confidenceBps: format(
        multiply(
          divide(reference.confidenceUsd, reference.usd),
          ratio(10_000n),
        ),
        2,
      ),
    },
    wrappers: full.map(({ wrapper, shares, price }) => ({
      id: wrapper.id,
      label: wrapper.label,
      issuer: wrapper.issuer,
      status: shares ? "quoted" : "unavailable",
      shares: shares ? format(shares, 6) : null,
      pricePerShare: price ? format(price, 4) : null,
      premiumBps: price && reference ? bps(divide(price, reference.usd)) : null,
      spreadBps: price && cheapest ? bps(divide(price, cheapest)) : null,
      allocation: format(
        ratio(
          (result.best.legs.find((q) => q.wrapperId === wrapper.id)?.inputRaw ??
            0n) * 100n,
          total,
        ),
        0,
      ),
      router: args.routers?.[wrapper.id] ?? null,
      multiplier: format(activeMultiplier(wrapper.exposure, now), 6),
      mint: wrapper.mint.startsWith("fixture:") ? null : wrapper.mint,
    })),
    plan: {
      shares: format(result.best.shares, 6),
      baselineShares: format(result.baseline.shares, 6),
      baselineLabel: label(result.baseline.legs[0]!.wrapperId),
      improvementShares: format(
        subtract(result.best.shares, result.baseline.shares),
        6,
      ),
      improvementUsd: format(result.estimatedImprovementUsd),
      feeUsd: format(result.best.feesUsd, 4),
      // Extra exposure versus the costliest full-order wrapper, valued at the cheapest observed price.
      edge:
        worst && edgeShares && cheapest
          ? {
              versus: worst.wrapper.label,
              shares: format(edgeShares, 6),
              usd: format(multiply(edgeShares, cheapest)),
            }
          : null,
      candidates: result.candidates,
      sharedLiquidity: result.best.sharedLiquidity,
      legs: result.best.legs.map((leg) => ({
        label: label(leg.wrapperId),
        amount: format(ratio(leg.inputRaw, 1_000_000n), 6),
        shares: format(legShares(leg), 6),
      })),
    },
    source: { slot: args.slot ?? null, quotes: quotes.length },
    execution: { enabled: false, reasons: [...new Set(args.reasons)] },
  };
}
