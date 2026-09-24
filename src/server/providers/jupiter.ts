import "server-only";
import { z } from "zod";
import { parseUnits, ratio, rawAmount, U64_MAX } from "../../domain/amount";
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

export const SOL_MINT = "So11111111111111111111111111111111111111112";

/** Read-only v2 order adapter. No taker, signing or submission path yet. */
export class JupiterClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async quote(outputMint: string, inputRaw: bigint) {
    mint.parse(outputMint);
    if (!this.apiKey || inputRaw <= 0n || inputRaw > U64_MAX)
      throw new Error("Invalid Jupiter configuration or amount");
    const url = new URL("https://api.jup.ag/swap/v2/order");
    url.search = new URLSearchParams({
      inputMint: USDC_MINT,
      outputMint,
      amount: inputRaw.toString(),
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
      result.errorCode !== undefined ||
      (result.otherAmountThreshold &&
        rawAmount(result.otherAmountThreshold) > rawAmount(result.outAmount))
    )
      throw new ProviderError("invalid-response", "Jupiter");
    return result;
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
