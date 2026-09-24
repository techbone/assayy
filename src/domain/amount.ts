/** Exact rational arithmetic. Numbers are reserved for bounded metadata and timestamps. */
export type Ratio = Readonly<{ n: bigint; d: bigint }>;
export const U64_MAX = (1n << 64n) - 1n;
export function ratio(n: bigint, d = 1n): Ratio {
  if (d <= 0n) throw new Error("Denominator must be positive");
  return { n, d };
}
export const add = (a: Ratio, b: Ratio): Ratio =>
  ratio(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtract = (a: Ratio, b: Ratio): Ratio =>
  ratio(a.n * b.d - b.n * a.d, a.d * b.d);
export const multiply = (a: Ratio, b: Ratio): Ratio =>
  ratio(a.n * b.n, a.d * b.d);
export function divide(a: Ratio, b: Ratio): Ratio {
  if (b.n <= 0n) throw new Error("Divisor must be positive");
  return ratio(a.n * b.d, a.d * b.n);
}
export const compare = (a: Ratio, b: Ratio) =>
  a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export function pow10(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38)
    throw new Error("Invalid decimals");
  return 10n ** BigInt(decimals);
}
export function rawAmount(value: string): bigint {
  if (!/^(0|[1-9]\d{0,19})$/.test(value)) throw new Error("Invalid raw amount");
  const parsed = BigInt(value);
  if (parsed > U64_MAX) throw new Error("Amount exceeds u64");
  return parsed;
}
export function parseUnits(value: string, decimals: number): bigint {
  pow10(decimals);
  if (!/^(0|[1-9]\d{0,19})(\.\d+)?$/.test(value))
    throw new Error("Enter a decimal amount without commas or exponents");
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places`);
  return rawAmount(
    (whole + fraction.padEnd(decimals, "0")).replace(/^0+(?=\d)/, ""),
  );
}
export function fromExponent(value: string, exponent: number): Ratio {
  if (
    !/^-?\d{1,38}$/.test(value) ||
    !Number.isInteger(exponent) ||
    Math.abs(exponent) > 38
  )
    throw new Error("Invalid oracle value");
  return exponent >= 0
    ? ratio(BigInt(value) * pow10(exponent))
    : ratio(BigInt(value), pow10(-exponent));
}
/** Truncate display only; never feed formatted values back into routing. */
export function format(value: Ratio, decimals = 2): string {
  const negative = value.n < 0n;
  const magnitude = negative ? -value.n : value.n;
  const scaled = (magnitude * pow10(decimals)) / value.d;
  const digits = scaled.toString().padStart(decimals + 1, "0");
  return `${negative ? "-" : ""}${decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits}`;
}
