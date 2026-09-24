import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST as execute } from "../src/app/api/buy/execute/route";
import { POST as quote } from "../src/app/api/buy/quote/route";
import { GET as health } from "../src/app/api/health/route";
import {
  decodeAddress,
  isRequiredSigner,
  requiredSigners,
} from "../src/domain/transaction";
import { jupiterBudget } from "../src/server/live";
import { ProviderError } from "../src/server/providers/http";
import {
  JupiterClient,
  OrderRejected,
  USDC_MINT,
} from "../src/server/providers/jupiter";
import { TOKEN_2022_PROGRAM } from "../src/server/registry";
import { AAPLX_MINT_BASE64 } from "./fixtures/mints";

const X = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const TAKER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const OTHER = "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH";
/** Minimal v0 transaction whose first static key (the fee payer / signer) is `signer`. */
const v0Transaction = (signer: string) => {
  const bytes = [
    1,
    ...new Array(64).fill(0),
    0x80,
    1,
    0,
    1,
    2,
    ...decodeAddress(signer),
    ...decodeAddress(USDC_MINT),
    ...new Array(32).fill(7),
    0,
    0,
  ];
  return Buffer.from(Uint8Array.from(bytes)).toString("base64");
};
const order = (extra: Record<string, unknown> = {}) => ({
  inputMint: USDC_MINT,
  outputMint: X,
  inAmount: "2000000",
  outAmount: "590000",
  otherAmountThreshold: "587000",
  swapMode: "ExactIn",
  slippageBps: 50,
  requestId: "req-12345678",
  router: "metis",
  swapType: "aggregator",
  transaction: v0Transaction(TAKER),
  feeBps: 10,
  feeMint: USDC_MINT,
  taker: TAKER,
  gasless: false,
  ...extra,
});
const reply = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));

describe("transaction inspection", () => {
  it("decodes base58 addresses to 32 bytes", () => {
    expect(decodeAddress("11111111111111111111111111111111")).toEqual(
      new Uint8Array(32),
    );
    expect(decodeAddress(USDC_MINT)).toHaveLength(32);
    expect(() => decodeAddress("0OIl")).toThrow();
  });
  it("finds required signers in a v0 message", () => {
    const tx = new Uint8Array(Buffer.from(v0Transaction(TAKER), "base64"));
    expect(requiredSigners(tx)).toHaveLength(1);
    expect(isRequiredSigner(tx, TAKER)).toBe(true);
    expect(isRequiredSigner(tx, OTHER)).toBe(false);
    expect(() => requiredSigners(tx.subarray(0, 70))).toThrow();
  });
});

describe("Jupiter order and execute", () => {
  it("sends the taker and accepts a transaction the taker must sign", async () => {
    const fetcher = reply(order());
    const result = await new JupiterClient("k", fetcher).order(
      X,
      2_000_000n,
      TAKER,
    );
    expect(result.requestId).toBe("req-12345678");
    expect(
      new URL(fetcher.mock.calls[0]![0].toString()).searchParams.get("taker"),
    ).toBe(TAKER);
  });
  it("rejects a transaction that does not need the taker's signature", async () => {
    await expect(
      new JupiterClient(
        "k",
        reply(order({ transaction: v0Transaction(OTHER) })),
      ).order(X, 2_000_000n, TAKER),
    ).rejects.toThrow("Jupiter: invalid-response");
  });
  it("surfaces Jupiter's refusal (e.g. insufficient funds) as a short message", async () => {
    const error = await new JupiterClient(
      "k",
      reply(
        order({
          transaction: "",
          errorCode: 1,
          errorMessage: "Route failed <script>",
        }),
      ),
    )
      .order(X, 2_000_000n, TAKER)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrderRejected);
    expect((error as Error).message).toBe("Route failed script");
  });
  it("explains insufficient funds in plain words", async () => {
    await expect(
      new JupiterClient(
        "k",
        reply(
          order({
            transaction: "",
            errorCode: 1,
            errorMessage: "Insufficient funds",
          }),
        ),
      ).order(X, 2_000_000n, TAKER),
    ).rejects.toThrow(/doesn't have enough USDC/);
  });
  it("keeps structured failures from execute and never retries", async () => {
    const fetcher = reply(
      { status: "Failed", code: -2003, error: "expired", signature: undefined },
      400,
    );
    const result = await new JupiterClient("k", fetcher).execute(
      "req-12345678",
      "AAAA",
    );
    expect(result).toMatchObject({ status: "Failed", code: -2003 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("reports a timeout, not a failure, when execute does not answer", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    await expect(
      new JupiterClient(
        "k",
        vi.fn<typeof fetch>().mockRejectedValue(timeout),
      ).execute("req-12345678", "AAAA"),
    ).rejects.toEqual(new ProviderError("timeout", "Jupiter"));
  });
});

const post = (body: unknown) =>
  new Request("http://localhost/api/buy", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const buyBody = { ticker: "AAPL", wrapper: "x", amount: "2", taker: TAKER };
const enable = () => {
  vi.stubEnv("ASSAY_MODE", "live");
  vi.stubEnv("ASSAY_EXECUTION", "on");
  vi.stubEnv("JUPITER_API_KEY", "test-jupiter-key");
  vi.stubEnv("SOLANA_RPC_URL", "https://rpc.example.test/private-token");
};
const upstream = (jupiter: (url: URL) => Response) =>
  vi.fn<typeof fetch>(async (input) => {
    const url = new URL(input.toString());
    if (url.hostname === "rpc.example.test")
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: {
          context: { slot: 9 },
          value: [
            { owner: TOKEN_2022_PROGRAM, data: [AAPLX_MINT_BASE64, "base64"] },
          ],
        },
      });
    return jupiter(url);
  });

describe("buy API", () => {
  afterEach(() => {
    jupiterBudget.reset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("is off unless explicitly enabled", async () => {
    vi.stubEnv("ASSAY_MODE", "live");
    vi.stubEnv("JUPITER_API_KEY", "k");
    vi.stubEnv("SOLANA_RPC_URL", "https://rpc.example.test");
    expect((await quote(post(buyBody))).status).toBe(403);
    expect((await execute(post({}))).status).toBe(403);
    expect(await health().json()).toMatchObject({ executionEnabled: false });
  });
  it("enforces the per-order cap and strict bodies", async () => {
    enable();
    const over = await quote(post({ ...buyBody, amount: "5.000001" }));
    expect(over.status).toBe(400);
    expect((await over.json()).code).toBe("OVER_LIMIT");
    expect((await quote(post({ ...buyBody, mint: X }))).status).toBe(400);
    expect((await quote(post({ ...buyBody, wrapper: "evil" }))).status).toBe(
      400,
    );
    expect((await quote(post("x".repeat(5000)))).status).toBe(400);
  });
  it("returns a reviewable quote with share-normalized minimum output", async () => {
    enable();
    vi.stubGlobal(
      "fetch",
      upstream(() => Response.json(order())),
    );
    const response = await quote(post(buyBody));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      requestId: "req-12345678",
      label: "AAPLx",
      mint: X,
      amount: "2.000000",
      tokens: "0.005900",
    });
    // 587000 raw x 1e-8 x active multiplier 1.003269...
    expect(body.minimumShares).toBe("0.005889");
    expect(JSON.stringify(body)).not.toContain("private-token");
  });
  it("reports a confirmed buy with received shares", async () => {
    enable();
    vi.stubGlobal(
      "fetch",
      upstream(() =>
        Response.json({
          status: "Success",
          code: 0,
          signature: "5".repeat(88),
          totalInputAmount: "2000000",
          totalOutputAmount: "590000",
        }),
      ),
    );
    const body = await (
      await execute(
        post({
          ticker: "AAPL",
          wrapper: "x",
          requestId: "req-12345678",
          signedTransaction: "AAAA",
        }),
      )
    ).json();
    expect(body).toMatchObject({
      status: "confirmed",
      signature: "5".repeat(88),
      paid: "2.000000",
      receivedShares: "0.005919",
    });
  });
  it("tells the user not to resubmit when the outcome is unknown", async () => {
    enable();
    vi.stubGlobal(
      "fetch",
      upstream(() => {
        throw Object.assign(new Error("t"), { name: "TimeoutError" });
      }),
    );
    const response = await execute(
      post({
        ticker: "AAPL",
        wrapper: "x",
        requestId: "req-12345678",
        signedTransaction: "AAAA",
      }),
    );
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ code: "OUTCOME_UNKNOWN" });
  });
});
