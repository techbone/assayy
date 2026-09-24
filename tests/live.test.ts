import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { format, multiply, ratio } from "../src/domain/amount";
import { decodeMint, EXTENSION } from "../src/domain/mint";
import { usEquitySession } from "../src/domain/session";
import {
  BusyError,
  CallBudget,
  liveComparison,
  LiveError,
} from "../src/server/live";
import { ProviderError } from "../src/server/providers/http";
import { JupiterClient, USDC_MINT } from "../src/server/providers/jupiter";
import { SolanaClient } from "../src/server/providers/solana";
import { TOKEN_2022_PROGRAM } from "../src/server/registry";
import { AAPLON_MINT_BASE64, AAPLX_MINT_BASE64 } from "./fixtures/mints";

const X = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const ON = "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo";
const now = 1_790_249_679; // Thu Sep 24 2026, before the US open
const decoded = (base64: string) => ({
  owner: TOKEN_2022_PROGRAM,
  ...decodeMint(new Uint8Array(Buffer.from(base64, "base64"))),
});
const chain = (
  patch: (mints: ReturnType<typeof decoded>[]) => void = () => {},
) => {
  const mints = [decoded(AAPLX_MINT_BASE64), decoded(AAPLON_MINT_BASE64)];
  patch(mints);
  return {
    mints: vi.fn().mockResolvedValue({ slot: 450_016_699, mints }),
  } as unknown as SolanaClient;
};
// Roughly $337/share: raw out per USDC raw, per mint decimals.
const order = (
  mint: string,
  input: bigint,
  extra: Record<string, unknown> = {},
) => {
  const out =
    mint === X
      ? (input * 2_953_682_982n) / 10_000_000_000n
      : (input * 29_518_755_680n) / 10_000_000_000n;
  return {
    inputMint: USDC_MINT,
    outputMint: mint,
    inAmount: input.toString(),
    outAmount: out.toString(),
    otherAmountThreshold: out.toString(),
    swapMode: "ExactIn",
    slippageBps: 0,
    requestId: "r",
    router: "jupiterz",
    swapType: "rfq",
    transaction: null,
    feeBps: 10,
    feeMint: USDC_MINT,
    routePlan: [
      {
        swapInfo: {
          ammKey: `Maker${mint.slice(0, 20)}AAAAAAAAAAAA`,
          label: "JupiterZ",
        },
      },
    ],
    ...extra,
  };
};
const jupiter = (
  respond: (mint: string, input: bigint) => unknown = (mint, input) =>
    order(mint, input),
) => {
  const client = new JupiterClient("k");
  client.quote = vi.fn(async (mint: string, input: bigint) => {
    const result = respond(mint, input);
    if (result instanceof Error) throw result;
    return result as Awaited<ReturnType<JupiterClient["quote"]>>;
  });
  client.solUsd = vi.fn(async () => ratio(113n));
  return client;
};
const run = (
  deps: Partial<Parameters<typeof liveComparison>[1]> = {},
  amount = "10000",
) =>
  liveComparison(
    { ticker: "AAPL", amount, scenario: "normal" },
    { jupiter: jupiter(), solana: chain(), clock: () => now, ...deps },
  );

describe("live comparison", () => {
  it("normalizes real quotes with the active on-chain multiplier", async () => {
    const result = await run();
    const x = result.wrappers.find((w) => w.label === "AAPLx")!;
    // AAPLx's scheduled multiplier took effect in August; the stale `multiplier` field must not be used.
    const active = decoded(AAPLX_MINT_BASE64).scaledUi!.newMultiplier;
    expect(x.shares).toBe(
      format(multiply(ratio(2_953_682_982n, 100_000_000n), active), 6),
    );
    expect(x.multiplier).toBe("1.003269");
    expect(result).toMatchObject({
      mode: "live",
      reference: null,
      session: "closed",
      source: { slot: 450_016_699, quotes: 4 },
      execution: { enabled: false },
    });
    expect(result.wrappers.every((w) => w.premiumBps === null)).toBe(true);
    expect(
      result.wrappers.find((w) => w.label === "AAPLon")!.spreadBps,
    ).not.toBe("0.0");
    expect(result.plan.edge).toMatchObject({ versus: "AAPLon" });
    expect(result.execution.reasons.join(" ")).toMatch(/Pyth/);
  });
  it("samples the full order on each wrapper plus a 50/50 split (4 quotes)", async () => {
    const client = jupiter();
    await run({ jupiter: client }, "100");
    const calls = vi
      .mocked(client.quote)
      .mock.calls.map(([m, a]) => `${m === X ? "x" : "on"}:${a}`);
    expect(calls.sort()).toEqual([
      "on:100000000",
      "on:50000000",
      "x:100000000",
      "x:50000000",
    ]);
  });
  it("reports an unquoted wrapper instead of hiding or inventing it", async () => {
    const result = await run({
      jupiter: jupiter((mint, input) =>
        mint === ON
          ? new ProviderError("unavailable", "Jupiter")
          : order(mint, input),
      ),
    });
    expect(result.wrappers.find((w) => w.label === "AAPLon")).toMatchObject({
      status: "unavailable",
      shares: null,
    });
    expect(result.plan.edge).toBeNull();
    expect(result.execution.reasons).toContain(
      "AAPLon: no Jupiter quote at this size",
    );
  });
  it("surfaces rate limits when no baseline could be quoted", async () => {
    await expect(
      run({
        jupiter: jupiter(() => new ProviderError("rate-limited", "Jupiter")),
      }),
    ).rejects.toThrow("Jupiter: rate-limited");
    await expect(
      run({ jupiter: jupiter(() => new ProviderError("timeout", "Jupiter")) }),
    ).rejects.toMatchObject({
      code: "NO_BASELINE",
    });
  });
  it("values reported fee lamports at SOL/USD", async () => {
    const client = jupiter((mint, input) =>
      order(mint, input, { signatureFeeLamports: 5_000 }),
    );
    const result = await run({ jupiter: client });
    expect(client.solUsd).toHaveBeenCalledOnce();
    expect(result.plan.feeUsd).toBe("0.0005"); // 5,000 lamports x $113, one leg
  });
  it.each([
    ["paused", (m: ReturnType<typeof decoded>[]) => void (m[0]!.paused = true)],
    [
      "new extension",
      (m: ReturnType<typeof decoded>[]) => void m[1]!.extensions.push(1),
    ],
    [
      "symbol changed",
      (m: ReturnType<typeof decoded>[]) =>
        void (m[1]!.metadata = { name: "Fake", symbol: "AAPLONX" }),
    ],
    [
      "decimals changed",
      (m: ReturnType<typeof decoded>[]) => void (m[0]!.decimals = 6),
    ],
    [
      "transfer hook set",
      (m: ReturnType<typeof decoded>[]) =>
        void (m[0]!.transferHookProgramSet = true),
    ],
    [
      "foreign program",
      (m: ReturnType<typeof decoded>[]) => void (m[0]!.owner = "Tokenkeg"),
    ],
    [
      "extension removed",
      (m: ReturnType<typeof decoded>[]) =>
        void (m[0]!.extensions = m[0]!.extensions.filter(
          (e) => e !== EXTENSION.permanentDelegate,
        )),
    ],
  ])("fails closed when mint state drifts: %s", async (_, patch) => {
    await expect(run({ solana: chain(patch) })).rejects.toMatchObject({
      code: "ASSET_STATE_CHANGED",
    });
  });
  it("pauses around a scheduled multiplier activation", async () => {
    for (const offset of [-600, 300]) {
      const solana = chain((m) => {
        m[1]!.scaledUi = {
          ...m[1]!.scaledUi!,
          newMultiplier: ratio(101n, 100n),
          effectiveAt: now + offset,
        };
      });
      await expect(run({ solana })).rejects.toMatchObject({
        code: "CORPORATE_ACTION_WINDOW",
      });
    }
  });
  it("refuses unverified tickers", async () => {
    await expect(
      liveComparison(
        { ticker: "NVDA", amount: "100", scenario: "normal" },
        { jupiter: jupiter(), solana: chain() },
      ),
    ).rejects.toBeInstanceOf(LiveError);
  });
});

describe("Solana RPC mint reader", () => {
  const rpc = (value: unknown) =>
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { context: { slot: 1 }, value },
      }),
    );
  it("reads mints with one getMultipleAccounts call", async () => {
    const fetcher = rpc([
      { owner: TOKEN_2022_PROGRAM, data: [AAPLX_MINT_BASE64, "base64"] },
      { owner: TOKEN_2022_PROGRAM, data: [AAPLON_MINT_BASE64, "base64"] },
    ]);
    const result = await new SolanaClient(
      "https://rpc.example.test",
      fetcher,
    ).mints([X, ON]);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject(
      {
        method: "getMultipleAccounts",
        params: [[X, ON], { encoding: "base64" }],
      },
    );
    expect(result.mints.map((m) => m.metadata?.symbol)).toEqual([
      "AAPLx",
      "AAPLon",
    ]);
  });
  it("rejects missing or undecodable accounts", async () => {
    for (const value of [
      [null, null],
      [{ owner: TOKEN_2022_PROGRAM, data: ["AAAA", "base64"] }],
    ]) {
      await expect(
        new SolanaClient("https://rpc.example.test", rpc(value)).mints([X, ON]),
      ).rejects.toThrow("Solana RPC: invalid-response");
    }
  });
});

describe("US equity session", () => {
  const at = (iso: string) => Date.parse(iso) / 1000;
  it.each([
    ["2026-09-24T13:29:00Z", "closed"], // 09:29 EDT
    ["2026-09-24T13:30:00Z", "open"],
    ["2026-09-24T19:59:00Z", "open"],
    ["2026-09-24T20:00:00Z", "closed"],
    ["2026-09-26T15:00:00Z", "closed"], // Saturday
    ["2026-09-07T15:00:00Z", "closed"], // Labor Day
    ["2026-11-27T18:30:00Z", "closed"], // early close, 13:30 EST
    ["2026-12-01T15:00:00Z", "open"], // EST (UTC-5)
    ["2027-03-01T15:00:00Z", "unknown"],
  ])("%s is %s", (iso, session) =>
    expect(usEquitySession(at(iso))).toBe(session),
  );
});

describe("Jupiter free-tier call budget", () => {
  it("queues a burst instead of exceeding 9 calls per 10 s", async () => {
    vi.useFakeTimers();
    try {
      const budget = new CallBudget();
      await budget.reserve(4);
      await budget.reserve(4);
      let third = false;
      const pending = budget.reserve(4).then(() => (third = true));
      await vi.advanceTimersByTimeAsync(9_000);
      expect(third).toBe(false);
      await vi.advanceTimersByTimeAsync(1_100);
      await pending;
      expect(third).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("reports busy when the wait would exceed its deadline", async () => {
    const budget = new CallBudget(9, 10_000, 1_000);
    await budget.reserve(9);
    await expect(budget.reserve(1)).rejects.toBeInstanceOf(BusyError);
  });
  it("reserves quote calls before fanning out", async () => {
    const budget = new CallBudget();
    const reserve = vi.spyOn(budget, "reserve");
    await run({ budget });
    expect(reserve).toHaveBeenCalledWith(4);
  });
});
