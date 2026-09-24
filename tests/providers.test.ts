import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PythClient } from "../src/server/providers/pyth";
import { JupiterClient, USDC_MINT } from "../src/server/providers/jupiter";

const feed = "a".repeat(64);
const outputMint = "So11111111111111111111111111111111111111112";
const validPyth = {
  parsed: [
    {
      id: feed,
      price: {
        price: "20000000000",
        conf: "1000000",
        expo: -8,
        publish_time: 1_800_000_000,
      },
    },
  ],
};
const validJupiter = {
  inputMint: USDC_MINT,
  outputMint,
  inAmount: "1000000",
  outAmount: "100",
  otherAmountThreshold: "99",
  swapMode: "ExactIn",
  slippageBps: 50,
  requestId: "test",
  router: "metis",
  transaction: null,
  feeBps: 0,
  feeMint: USDC_MINT,
};
const fake = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));

describe("Pyth adapter", () => {
  it("uses authenticated upgraded Hermes and preserves exponent/confidence/time", async () => {
    const fetcher = fake(validPyth);
    const result = await new PythClient("test-secret", fetcher).prices([feed]);
    expect(result[0]?.usd).toEqual({ n: 20000000000n, d: 100000000n });
    expect(fetcher.mock.calls[0]?.[0].toString()).toContain(
      "pyth.dourolabs.app/hermes/v2/updates/price/latest",
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer test-secret",
    });
  });
  it("rejects missing and substituted feeds", async () => {
    await expect(
      new PythClient("key", fake({ parsed: [] })).prices([feed]),
    ).rejects.toThrow(/invalid-response/);
    await expect(
      new PythClient("key", fake(validPyth)).prices(["b".repeat(64)]),
    ).rejects.toThrow(/invalid-response/);
  });
  it("rejects numeric oracle amounts instead of coercing them", async () => {
    await expect(
      new PythClient(
        "key",
        fake({
          parsed: [
            { id: feed, price: { ...validPyth.parsed[0]!.price, price: 200 } },
          ],
        }),
      ).prices([feed]),
    ).rejects.toThrow(/invalid-response/);
  });
  it("fails closed on rate limits without leaking upstream details", async () => {
    await expect(
      new PythClient("secret", fake({ details: "sensitive" }, 429)).prices([
        feed,
      ]),
    ).rejects.toThrow("Pyth: rate-limited");
  });
});
describe("Jupiter v2 adapter", () => {
  it("requests ExactIn quotes with raw strings and no taker", async () => {
    const fetcher = fake(validJupiter);
    await new JupiterClient("test-secret", fetcher).quote(
      outputMint,
      1_000_000n,
    );
    const url = new URL(fetcher.mock.calls[0]![0].toString());
    expect(url.pathname).toBe("/swap/v2/order");
    expect(url.searchParams.get("amount")).toBe("1000000");
    expect(url.searchParams.has("taker")).toBe(false);
  });
  it("rejects provider responses for a different asset or amount", async () => {
    for (const response of [
      { ...validJupiter, outputMint: USDC_MINT },
      { ...validJupiter, inAmount: "1000001" },
      { ...validJupiter, errorCode: 1 },
    ]) {
      await expect(
        new JupiterClient("key", fake(response)).quote(outputMint, 1_000_000n),
      ).rejects.toThrow(/invalid-response/);
    }
  });
  it("rejects u64 overflow, zero outputs and a floor above expected output", async () => {
    for (const response of [
      { ...validJupiter, outAmount: "18446744073709551616" },
      { ...validJupiter, outAmount: "0" },
      { ...validJupiter, otherAmountThreshold: "101" },
    ]) {
      await expect(
        new JupiterClient("key", fake(response)).quote(outputMint, 1_000_000n),
      ).rejects.toThrow(/invalid-response/);
    }
  });
  it("does not reflect upstream URLs, keys or response messages", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("secret provider URL"));
    await expect(
      new JupiterClient("secret", fetcher).quote(outputMint, 1n),
    ).rejects.toThrow("Jupiter: unavailable");
  });
});
