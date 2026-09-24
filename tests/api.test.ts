import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as compare } from "../src/app/api/compare/route";
import { GET as health } from "../src/app/api/health/route";
import { USDC_MINT } from "../src/server/providers/jupiter";
import { jupiterBudget } from "../src/server/live";
import { TOKEN_2022_PROGRAM } from "../src/server/registry";
import { AAPLON_MINT_BASE64, AAPLX_MINT_BASE64 } from "./fixtures/mints";

afterEach(() => {
  jupiterBudget.reset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const request = (query = "ticker=AAPL&amount=100") =>
  new Request(`http://localhost/api/compare?${query}`);
const liveEnv = () => {
  vi.stubEnv("ASSAY_MODE", "live");
  vi.stubEnv("JUPITER_API_KEY", "test-jupiter-key");
  vi.stubEnv("SOLANA_RPC_URL", "https://rpc.example.test/private-token");
};
/** Fake upstreams: mainnet mint bytes captured read-only, and simple Jupiter orders. */
const upstream = (jupiterStatus = 200) =>
  vi.fn<typeof fetch>(async (input) => {
    const url = new URL(input.toString());
    if (url.hostname === "rpc.example.test")
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: {
          context: { slot: 7 },
          value: [AAPLX_MINT_BASE64, AAPLON_MINT_BASE64].map((data) => ({
            owner: TOKEN_2022_PROGRAM,
            data: [data, "base64"],
          })),
        },
      });
    const amount = url.searchParams.get("amount")!;
    return Response.json(
      {
        inputMint: USDC_MINT,
        outputMint: url.searchParams.get("outputMint"),
        inAmount: amount,
        outAmount: (BigInt(amount) * 29n).toString(),
        swapMode: "ExactIn",
        slippageBps: 0,
        requestId: "r",
        router: "metis",
        transaction: null,
        feeBps: 0,
        feeMint: USDC_MINT,
      },
      { status: jupiterStatus },
    );
  });

describe("API trust boundary", () => {
  it("labels fixtures and marks comparisons non-cacheable", async () => {
    vi.stubEnv("ASSAY_MODE", "demo");
    const response = await compare(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect((await response.json()).mode).toBe("demo");
  });
  it("never silently falls back from live to synthetic data", async () => {
    vi.stubEnv("ASSAY_MODE", "live");
    vi.stubEnv("JUPITER_API_KEY", "");
    const response = await compare(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("LIVE_NOT_READY");
  });
  it("invalid mode fails closed", async () => {
    vi.stubEnv("ASSAY_MODE", "typo");
    expect((await compare(request())).status).toBe(503);
    expect(health().status).toBe(503);
  });
  it.each([
    "ticker=AAPL&amount=100&amount=200",
    "ticker=AAPL&amount=100&mint=arbitrary",
    "ticker=FAKE&amount=100",
  ])("rejects parameter tampering: %s", async (query) => {
    expect((await compare(request(query))).status).toBe(400);
  });
  it("health reports readiness without returning credentials", async () => {
    vi.stubEnv("ASSAY_MODE", "demo");
    vi.stubEnv("PYTH_API_KEY", "private-test-key");
    vi.stubEnv("SOLANA_RPC_URL", "https://rpc.example.test/private-token");
    const response = health();
    const body = await response.text();
    expect(body).not.toContain("private-test-key");
    expect(body).not.toContain("private-token");
    expect(JSON.parse(body)).toMatchObject({
      liveReady: false,
      executionEnabled: false,
      configured: { pyth: true, rpc: true },
    });
  });
});

describe("live API", () => {
  it("returns a live comparison without leaking provider secrets", async () => {
    liveEnv();
    const fetcher = upstream();
    vi.stubGlobal("fetch", fetcher);
    const response = await compare(request("ticker=AAPL&amount=123"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).not.toContain("private-token");
    expect(body).not.toContain("test-jupiter-key");
    expect(JSON.parse(body)).toMatchObject({ mode: "live", reference: null });
    expect(fetcher).toHaveBeenCalledTimes(5); // 1 RPC + 4 quotes
    // An identical request moments later shares the same upstream fan-out.
    await compare(request("ticker=AAPL&amount=123"));
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(health()).toBeTruthy();
    expect(await health().json()).toMatchObject({
      liveReady: true,
      verifiedAssets: expect.arrayContaining(["AAPL", "NVDA", "SPY"]),
      fairValueReference: false,
    });
  });
  it("rejects unverified tickers and demo-only scenarios", async () => {
    liveEnv();
    vi.stubGlobal("fetch", upstream());
    const unverified = await compare(request("ticker=XRX&amount=100"));
    expect(unverified.status).toBe(422);
    expect((await unverified.json()).code).toBe("UNSUPPORTED_ASSET");
    expect(
      (await compare(request("ticker=AAPL&amount=100&scenario=closed"))).status,
    ).toBe(400);
  });
  it("maps provider rate limits to 429 with Retry-After", async () => {
    liveEnv();
    vi.stubGlobal("fetch", upstream(429));
    const response = await compare(request("ticker=AAPL&amount=321"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    expect((await response.json()).code).toBe("RATE_LIMITED");
  });
  it("reports provider outages without substituting data", async () => {
    liveEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("secret url")),
    );
    const response = await compare(request("ticker=AAPL&amount=222"));
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).not.toContain("secret url");
    expect(JSON.parse(body).code).toBe("PROVIDER_UNAVAILABLE");
  });
});
