import "server-only";
import { z } from "zod";
import { parseUnits, ratio, rawAmount, U64_MAX } from "../../domain/amount";
import { isRequiredSigner } from "../../domain/transaction";
import { fetchValidated, ProviderError } from "./http";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const amount = z.string().refine((value) => {
  try {
    return rawAmount(value) > 0n;
  } catch {
    return false;
  }
});
const lamports = z.number().int().nonnegative().safe().optional();
const priceSchema = z.record(
  z.string(),
  z.object({ usdPrice: z.number().positive().finite() }).passthrough(),
);
const orderSchema = z
  .object({
    inputMint: mint,
    outputMint: mint,
    inAmount: amount,
    outAmount: amount,
    otherAmountThreshold: amount.optional(),
    swapMode: z.literal("ExactIn"),
    slippageBps: z.number().int().min(0).max(10_000),
    requestId: z.string().min(1),
    router: z.string().min(1),
    transaction: z.string().nullable(),
    feeBps: z.number().int().min(0).max(10_000),
    feeMint: mint,
    errorCode: z.number().optional(),
    swapType: z.string().optional(),
    signatureFeeLamports: lamports,
    prioritizationFeeLamports: lamports,
    rentFeeLamports: lamports,
    errorMessage: z.string().optional(),
    taker: z.string().nullable().optional(),
    gasless: z.boolean().optional(),
    expireAt: z.union([z.string(), z.number()]).nullable().optional(),
    lastValidBlockHeight: z
      .union([z.string(), z.number()])
      .nullable()
      .optional(),
    routePlan: z
      .array(
        z
          .object({
            swapInfo: z
              .object({ ammKey: mint.optional(), label: z.string().optional() })
              .passthrough(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const rawOrZero = z.string().refine((value) => {
  try {
    rawAmount(value);
    return true;
  } catch {
    return false;
  }
});
const executeSchema = z
  .object({
    status: z.enum(["Success", "Failed"]),
    signature: z
      .string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/)
      .optional(),
    code: z.number().int(),
    error: z.string().optional(),
    totalInputAmount: rawOrZero.optional(),
    totalOutputAmount: rawOrZero.optional(),
  })
  .passthrough();
export type ExecuteResult = z.infer<typeof executeSchema>;

/** Jupiter refused to build a transaction (e.g. insufficient funds). Nothing was signed. */
export class OrderRejected extends Error {
  constructor(message: string) {
    // Upstream text is shown to the user, so keep it short and printable.
    super(
      message.replace(/[^\w .,:;'()$%/-]/g, "").slice(0, 160) ||
        "Order rejected",
    );
  }
}

export const SOL_MINT = "So11111111111111111111111111111111111111112";

/** Jupiter v2 order/execute adapter. USDC input only; the server never holds keys or signs. */
export class JupiterClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private async request(outputMint: string, inputRaw: bigint, taker?: string) {
    mint.parse(outputMint);
    if (taker !== undefined) mint.parse(taker);
    if (!this.apiKey || inputRaw <= 0n || inputRaw > U64_MAX)
      throw new Error("Invalid Jupiter configuration or amount");
    const url = new URL("https://api.jup.ag/swap/v2/order");
    url.search = new URLSearchParams({
      inputMint: USDC_MINT,
      outputMint,
      amount: inputRaw.toString(),
      ...(taker ? { taker } : {}),
    }).toString();
    const result = await fetchValidated(
      "Jupiter",
      url,
      orderSchema,
      { headers: { "x-api-key": this.apiKey } },
      this.fetcher,
    );
    if (
      result.inputMint !== USDC_MINT ||
      result.outputMint !== outputMint ||
      result.inAmount !== inputRaw.toString() ||
      (result.otherAmountThreshold &&
        rawAmount(result.otherAmountThreshold) > rawAmount(result.outAmount))
    )
      throw new ProviderError("invalid-response", "Jupiter");
    return result;
  }
  /** Quote only: no taker, no transaction. */
  async quote(outputMint: string, inputRaw: bigint) {
    const result = await this.request(outputMint, inputRaw);
    if (result.errorCode !== undefined)
      throw new ProviderError("invalid-response", "Jupiter");
    return result;
  }
  /** Buildable order for `taker`. The unsigned transaction must list the taker as a signer. */
  async order(outputMint: string, inputRaw: bigint, taker: string) {
    const result = await this.request(outputMint, inputRaw, taker);
    if (result.errorCode !== undefined || !result.transaction)
      throw new OrderRejected(
        result.errorMessage ?? "Jupiter could not build this order",
      );
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(result.transaction, "base64"));
      if (bytes.length > 1232 || !isRequiredSigner(bytes, taker))
        throw new Error("Unexpected signer set");
    } catch {
      throw new ProviderError("invalid-response", "Jupiter");
    }
    return { ...result, transaction: result.transaction };
  }
  /** Submits a wallet-signed order. Never retried here: a timeout means the outcome is unknown. */
  async execute(requestId: string, signedTransaction: string) {
    if (!this.apiKey) throw new Error("Invalid Jupiter configuration");
    let response: Response;
    try {
      response = await this.fetcher("https://api.jup.ag/swap/v2/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({ requestId, signedTransaction }),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      throw new ProviderError(
        error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
          ? "timeout"
          : "unavailable",
        "Jupiter",
      );
    }
    if (response.status === 429)
      throw new ProviderError("rate-limited", "Jupiter");
    // Failed executions may arrive as 4xx with a structured body; keep them.
    const parsed = executeSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ProviderError(
        response.ok ? "invalid-response" : "unavailable",
        "Jupiter",
      );
    return parsed.data;
  }
  /** SOL/USD for valuing network-fee lamports only; never used for share pricing. */
  async solUsd() {
    if (!this.apiKey) throw new Error("Invalid Jupiter configuration");
    const url = new URL("https://api.jup.ag/price/v3");
    url.search = new URLSearchParams({ ids: SOL_MINT }).toString();
    const result = await fetchValidated(
      "Jupiter",
      url,
      priceSchema,
      { headers: { "x-api-key": this.apiKey } },
      this.fetcher,
    );
    const price = result[SOL_MINT]?.usdPrice;
    if (!price) throw new ProviderError("invalid-response", "Jupiter");
    // Fee valuation needs cents, not binary64 precision.
    return ratio(parseUnits(price.toFixed(6), 6), 1_000_000n);
  }
}
