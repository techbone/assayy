import { describe, expect, it } from "vitest";
import {
  compare,
  format,
  fromExponent,
  parseUnits,
  ratio,
  rawAmount,
  U64_MAX,
} from "../src/domain/amount";
import { normalizeShares } from "../src/domain/normalization";
import { assessQuote, DEFAULT_POLICY, oracleIssues } from "../src/domain/guard";
import { allocationGrid, optimize } from "../src/domain/optimizer";
import { executionSummary, transition } from "../src/domain/execution";
import type { OraclePrice, Quote, Wrapper } from "../src/domain/types";
import { comparisonRequest } from "../src/domain/contracts";
import { demoComparison } from "../src/fixtures/comparison";

const now = 1_800_000_000;
const wrapper: Wrapper = {
  id: "x",
  label: "AAPLx",
  issuer: "test",
  mint: "fixture",
  exposure: {
    decimals: 6,
    displayMultiplier: ratio(1n),
    sharesPerDisplayUnit: ratio(1n),
    verified: true,
    verifiedUntil: now + 60,
    source: "test evidence",
  },
};
const equity: OraclePrice = {
  id: "equity",
  usd: ratio(100n),
  confidenceUsd: ratio(1n, 100n),
  publishedAt: now - 2,
};
const usdc: OraclePrice = {
  id: "usdc",
  usd: ratio(1n),
  confidenceUsd: ratio(1n, 10_000n),
  publishedAt: now - 1,
};
const quote: Quote = {
  wrapperId: "x",
  inputRaw: 100_000_000n,
  outputRaw: 1_010_000n,
  minimumOutputRaw: 1_000_000n,
  quotedAt: now,
  expiresAt: now + 20,
  networkFeeUsd: ratio(1n, 100n),
  poolIds: ["pool:x"],
};
const guard = (overrides: Partial<Parameters<typeof assessQuote>[0]> = {}) =>
  assessQuote({
    quote,
    wrapper,
    equity,
    usdc,
    now,
    session: "open",
    ...overrides,
  });

describe("exact amounts", () => {
  it("retains raw amounts above Number.MAX_SAFE_INTEGER", () => {
    expect(parseUnits("9007199254.740993", 6)).toBe(9007199254740993n);
    expect(rawAmount(U64_MAX.toString())).toBe(U64_MAX);
  });
  it.each([
    "1e6",
    "-1",
    "0.0000001",
    "1,000",
    "NaN",
    "Infinity",
    " 1",
    "01",
    "1.",
  ])("rejects ambiguous input %s", (input) =>
    expect(() => parseUnits(input, 6)).toThrow(),
  );
  it("rejects u64 overflow", () =>
    expect(() => rawAmount((U64_MAX + 1n).toString())).toThrow());
  it("retains oracle exponents and truncates only for display", () => {
    expect(format(fromExponent("123456789", -6), 6)).toBe("123.456789");
    expect(format(ratio(-12349n, 1000n))).toBe("-12.34");
    expect(format(fromExponent("12", 2))).toBe("1200.00");
  });
});
describe("normalization", () => {
  it("combines token decimals, display scale and independent economic exposure", () => {
    const exposure = {
      ...wrapper.exposure,
      displayMultiplier: ratio(2n),
      sharesPerDisplayUnit: ratio(3n, 2n),
    };
    expect(format(normalizeShares(2_000_000n, exposure, now))).toBe("6.00");
  });
  it("uses scheduled multiplier at the exact activation second", () => {
    const exposure = {
      ...wrapper.exposure,
      nextMultiplier: { effectiveAt: now + 10, value: ratio(2n) },
    };
    expect(format(normalizeShares(1_000_000n, exposure, now))).toBe("1.00");
    expect(format(normalizeShares(1_000_000n, exposure, now + 10))).toBe(
      "2.00",
    );
    expect(() => normalizeShares(1_000_000n, exposure, now, now + 10)).toThrow(
      /Corporate action/,
    );
  });
  it("rejects missing and expired normalization evidence", () => {
    expect(() =>
      normalizeShares(1n, { ...wrapper.exposure, verified: false }, now),
    ).toThrow();
    expect(() =>
      normalizeShares(1n, { ...wrapper.exposure, verifiedUntil: now - 1 }, now),
    ).toThrow();
    expect(() =>
      normalizeShares(1n, { ...wrapper.exposure, source: "" }, now),
    ).toThrow();
  });
});
describe("fair-value guards", () => {
  it("allows valid minimum output", () => expect(guard().allowed).toBe(true));
  it("checks minimum received, even when the optimistic output is good", () => {
    expect(
      guard({ quote: { ...quote, minimumOutputRaw: 900_000n } }).reasons.join(),
    ).toMatch(/premium limit/);
  });
  it.each(["closed", "unknown"] as const)(
    "blocks %s market sessions",
    (session) => expect(guard({ session }).allowed).toBe(false),
  );
  it("rejects stale, future, zero and wide-confidence prices", () => {
    for (const invalid of [
      { ...equity, publishedAt: now - 61 },
      { ...equity, publishedAt: now + 6 },
      { ...equity, usd: ratio(0n) },
      { ...equity, confidenceUsd: ratio(1n) },
    ])
      expect(guard({ equity: invalid }).allowed).toBe(false);
  });
  it("does not assume USDC is a dollar", () =>
    expect(guard({ usdc: { ...usdc, usd: ratio(103n, 100n) } }).allowed).toBe(
      false,
    ));
  it("blocks stale USDC separately from a fresh stock oracle", () =>
    expect(guard({ usdc: { ...usdc, publishedAt: now - 61 } }).allowed).toBe(
      false,
    ));
  it("accepts the precise confidence boundary", () =>
    expect(
      oracleIssues(
        { ...equity, confidenceUsd: ratio(1n, 2n) },
        now,
        DEFAULT_POLICY,
      ),
    ).toEqual([]));
  it("rejects expired quotes, asset mismatch and zero minimum output", () => {
    for (const invalid of [
      { ...quote, expiresAt: now },
      { ...quote, wrapperId: "imposter" },
      { ...quote, minimumOutputRaw: 0n },
    ])
      expect(guard({ quote: invalid }).allowed).toBe(false);
  });
  it("rejects exposure that expires before the quote", () =>
    expect(
      guard({
        wrapper: {
          ...wrapper,
          exposure: { ...wrapper.exposure, verifiedUntil: now + 10 },
        },
      }).allowed,
    ).toBe(false));
});
describe("allocation search", () => {
  const wrappers = [wrapper, { ...wrapper, id: "on" }];
  const sample = (
    id: string,
    input: bigint,
    output: bigint,
    fee = 0n,
  ): Quote => ({
    ...quote,
    wrapperId: id,
    inputRaw: input,
    outputRaw: output,
    minimumOutputRaw: output,
    networkFeeUsd: ratio(fee),
    poolIds: [`pool:${id}`],
  });
  it("finds a split without assuming convex depth", () => {
    const quotes = [
      sample("x", 100n, 90n),
      sample("on", 100n, 80n),
      sample("x", 50n, 60n),
      sample("on", 50n, 50n),
    ];
    const result = optimize({
      total: 100n,
      wrappers,
      quotes,
      shareValueUsd: ratio(100n),
      now,
    });
    expect(result.best.legs.length).toBe(2);
    expect(result.best.legs.reduce((sum, q) => sum + q.inputRaw, 0n)).toBe(
      100n,
    );
    expect(compare(result.estimatedImprovementUsd, ratio(0n))).toBe(1);
  });
  it("chooses the single route when extra fees exceed extra exposure", () => {
    const quotes = [
      sample("x", 100n, 90n),
      sample("on", 100n, 80n),
      sample("x", 50n, 60n, 1n),
      sample("on", 50n, 50n, 1n),
    ];
    expect(
      optimize({
        total: 100n,
        wrappers,
        quotes,
        shareValueUsd: ratio(100n),
        now,
      }).best.legs.length,
    ).toBe(1);
  });
  it("will not fabricate a full-size baseline from chunk quotes", () => {
    expect(() =>
      optimize({
        total: 100n,
        wrappers,
        quotes: [sample("x", 50n, 60n), sample("on", 50n, 50n)],
        shareValueUsd: ratio(100n),
        now,
      }),
    ).toThrow(/baseline/);
  });
  it("flags shared liquidity instead of treating legs as independent", () => {
    const quotes = [
      sample("x", 100n, 90n),
      { ...sample("x", 50n, 60n), poolIds: ["shared"] },
      { ...sample("on", 50n, 50n), poolIds: ["shared"] },
    ];
    expect(
      optimize({
        total: 100n,
        wrappers,
        quotes,
        shareValueUsd: ratio(100n),
        now,
      }).best.sharedLiquidity,
    ).toBe(true);
  });
  it("rejects duplicate samples", () =>
    expect(() =>
      optimize({
        total: 100n,
        wrappers,
        quotes: [sample("x", 100n, 90n), sample("x", 100n, 91n)],
        shareValueUsd: ratio(100n),
        now,
      }),
    ).toThrow(/Duplicate/));
  it("retains integer dust in complementary allocations", () => {
    for (const total of [1n, 3n, 101n, 250_000_000_001n])
      for (const allocation of allocationGrid(total))
        expect(allocation + (total - allocation)).toBe(total);
  });
});
describe("execution receipt transitions", () => {
  it("preserves an uncertain signature and disallows new execution", () => {
    const signing = transition(
      { status: "ready" },
      { type: "request-signature" },
    );
    const submitted = transition(signing, {
      type: "broadcast",
      signature: "signature",
    });
    const unknown = transition(submitted, { type: "timeout" });
    expect(unknown).toEqual({ status: "unknown", signature: "signature" });
    expect(() => transition(unknown, { type: "request-signature" })).toThrow();
    expect(transition(unknown, { type: "confirmed" }).status).toBe("confirmed");
  });
  it("labels partial fills and never reports them as complete", () => {
    expect(
      executionSummary([
        { status: "confirmed", signature: "one" },
        { status: "failed", reason: "guard" },
      ]),
    ).toBe("partial");
    expect(executionSummary([{ status: "unknown", signature: "one" }])).toBe(
      "pending",
    );
  });
});
describe("comparison contract", () => {
  it.each(["1", "10000", "250000", "100.000001"])(
    "accepts %s and returns JSON-safe demo output",
    (amount) => {
      const request = comparisonRequest.parse({ ticker: "AAPL", amount });
      const result = demoComparison(request, now);
      expect(result.execution.enabled).toBe(false);
      expect(result.mode).toBe("demo");
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(
        result.plan.legs.reduce(
          (sum, leg) => sum + parseUnits(leg.amount, 6),
          0n,
        ),
      ).toBe(parseUnits(amount, 6));
    },
  );
  it.each(["0", "250000.000001", "1e5", "-1"])(
    "rejects unsupported budget %s",
    (amount) =>
      expect(
        comparisonRequest.safeParse({ ticker: "AAPL", amount }).success,
      ).toBe(false),
  );
  it("rejects unknown fields and tickers", () => {
    expect(
      comparisonRequest.safeParse({
        ticker: "AAPL",
        amount: "100",
        outputMint: "attacker",
      }).success,
    ).toBe(false);
    expect(
      comparisonRequest.safeParse({ ticker: "aapl;", amount: "100" }).success,
    ).toBe(false);
  });
});
