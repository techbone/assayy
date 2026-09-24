import { add, compare, multiply, ratio, subtract, type Ratio } from "./amount";
import { normalizeShares } from "./normalization";
import type { Quote, Wrapper } from "./types";

export type Plan = {
  legs: Quote[];
  shares: Ratio;
  feesUsd: Ratio;
  valueAfterFeesUsd: Ratio;
  sharedLiquidity: boolean;
};
export function allocationGrid(total: bigint, steps = 4): bigint[] {
  if (total <= 0n || !Number.isInteger(steps) || steps < 1 || steps > 8)
    throw new Error("Invalid allocation grid");
  return [
    ...new Set(
      Array.from(
        { length: steps + 1 },
        (_, i) => (total * BigInt(i)) / BigInt(steps),
      ),
    ),
  ];
}
/** Best observed allocation across two wrappers; no convexity assumption or extrapolation. */
export function optimize(args: {
  total: bigint;
  wrappers: readonly Wrapper[];
  quotes: readonly Quote[];
  /** Values fees against shares: an oracle price, or the observed full-order cost in live mode. */
  shareValueUsd: Ratio;
  now: number;
}): {
  best: Plan;
  baseline: Plan;
  estimatedImprovementUsd: Ratio;
  candidates: number;
} {
  const { total, wrappers, quotes, shareValueUsd, now } = args;
  if (
    wrappers.length !== 2 ||
    wrappers[0]!.id === wrappers[1]!.id ||
    total <= 0n ||
    shareValueUsd.n <= 0n
  )
    throw new Error(
      "Two distinct wrappers and a positive budget/reference are required",
    );
  const seen = new Set<string>();
  for (const quote of quotes) {
    const key = `${quote.wrapperId}:${quote.inputRaw}`;
    if (seen.has(key)) throw new Error("Duplicate quote sample");
    seen.add(key);
    if (
      !wrappers.some((w) => w.id === quote.wrapperId) ||
      quote.inputRaw <= 0n ||
      quote.inputRaw > total ||
      quote.outputRaw <= 0n ||
      quote.minimumOutputRaw <= 0n ||
      quote.minimumOutputRaw > quote.outputRaw ||
      quote.networkFeeUsd.n < 0n ||
      quote.expiresAt <= now ||
      quote.quotedAt > now
    )
      throw new Error("Invalid quote sample");
  }
  const candidates: Plan[] = [];
  const build = (legs: Quote[]) => {
    let shares = ratio(0n),
      feesUsd = ratio(0n);
    const pools = new Set<string>();
    let sharedLiquidity = false;
    for (const leg of legs) {
      const wrapper = wrappers.find((w) => w.id === leg.wrapperId)!;
      shares = add(
        shares,
        normalizeShares(leg.outputRaw, wrapper.exposure, now, leg.expiresAt),
      );
      feesUsd = add(feesUsd, leg.networkFeeUsd);
      for (const pool of new Set(leg.poolIds)) {
        if (pools.has(pool)) sharedLiquidity = true;
        pools.add(pool);
      }
    }
    candidates.push({
      legs,
      shares,
      feesUsd,
      sharedLiquidity,
      valueAfterFeesUsd: subtract(multiply(shares, shareValueUsd), feesUsd),
    });
  };
  quotes.filter((q) => q.inputRaw === total).forEach((q) => build([q]));
  for (const first of quotes.filter(
    (q) => q.wrapperId === wrappers[0]!.id && q.inputRaw < total,
  )) {
    const second = quotes.find(
      (q) =>
        q.wrapperId === wrappers[1]!.id &&
        q.inputRaw === total - first.inputRaw,
    );
    if (second) build([first, second]);
  }
  const ranked = candidates.sort(
    (a, b) =>
      compare(b.valueAfterFeesUsd, a.valueAfterFeesUsd) ||
      a.legs.length - b.legs.length,
  );
  const best = ranked[0];
  const baseline = ranked.find((plan) => plan.legs.length === 1);
  if (!best || !baseline)
    throw new Error("A full-size single-wrapper baseline is required");
  return {
    best,
    baseline,
    estimatedImprovementUsd: subtract(
      best.valueAfterFeesUsd,
      baseline.valueAfterFeesUsd,
    ),
    candidates: candidates.length,
  };
}
