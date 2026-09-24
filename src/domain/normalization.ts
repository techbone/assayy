import { multiply, pow10, ratio, type Ratio } from "./amount";
import type { Exposure } from "./types";

export function normalizeShares(
  raw: bigint,
  exposure: Exposure,
  now: number,
  validThrough = now,
): Ratio {
  if (
    raw < 0n ||
    !exposure.verified ||
    !exposure.source ||
    exposure.verifiedUntil < validThrough
  ) {
    throw new Error("Share exposure is unverified or expired");
  }
  const next = exposure.nextMultiplier;
  if (next && next.effectiveAt > now && next.effectiveAt <= validThrough) {
    throw new Error("Corporate action crosses the quote validity window");
  }
  const multiplier = activeMultiplier(exposure, now);
  if (multiplier.n <= 0n || exposure.sharesPerDisplayUnit.n <= 0n)
    throw new Error("Invalid share exposure");
  return multiply(
    multiply(ratio(raw, pow10(exposure.decimals)), multiplier),
    exposure.sharesPerDisplayUnit,
  );
}

/** Token-2022 semantics: the scheduled multiplier replaces the current one at its timestamp. */
export function activeMultiplier(exposure: Exposure, now: number): Ratio {
  const next = exposure.nextMultiplier;
  return next && now >= next.effectiveAt
    ? next.value
    : exposure.displayMultiplier;
}
