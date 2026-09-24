import "server-only";
import {
  add,
  compare,
  format,
  divide,
  multiply,
  parseUnits,
  ratio,
  type Ratio,
} from "../domain/amount";
import type {
  BuyQuote,
  BuyRequest,
  BuyResult,
  Comparison,
  ComparisonRequest,
  ExecuteRequest,
} from "../domain/contracts";
import type { DecodedMint } from "../domain/mint";
import { normalizeShares } from "../domain/normalization";
import { optimize } from "../domain/optimizer";
import { presentComparison } from "../domain/present";
import { usEquitySession } from "../domain/session";
import type { Quote, Wrapper } from "../domain/types";
import { ProviderError } from "./providers/http";
import type { JupiterClient } from "./providers/jupiter";
import type { SolanaClient } from "./providers/solana";
import {
  findAsset,
  TOKEN_2022_PROGRAM,
  type VerifiedWrapper,
} from "./registry";

export class LiveError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_ASSET"
      | "ASSET_STATE_CHANGED"
      | "CORPORATE_ACTION_WINDOW"
      | "NO_BASELINE"
      | "OVER_LIMIT",
    message: string,
  ) {
    super(message);
  }
}

const QUOTE_TTL_SECONDS = 20;
// xStocks asks integrators to pause around multiplier activation.
const MULTIPLIER_BUFFER_SECONDS = 15 * 60;

export function admit(
  entry: VerifiedWrapper,
  mint: DecodedMint & { owner: string },
  now: number,
): Wrapper {
  const expected = new Set(entry.extensions);
  const drift =
    mint.owner !== TOKEN_2022_PROGRAM ||
    !mint.initialized ||
    mint.decimals !== entry.decimals ||
    mint.metadata?.symbol !== entry.metadataSymbol ||
    mint.extensions.length !== expected.size ||
    mint.extensions.some((type) => !expected.has(type)) ||
    mint.paused !== false ||
    mint.transferHookProgramSet !== false ||
    !mint.scaledUi;
  if (drift)
    throw new LiveError(
      "ASSET_STATE_CHANGED",
      `${entry.label} mint state no longer matches its verified profile. Comparison paused for review.`,
    );
  const scaled = mint.scaledUi!;
  if (
    compare(scaled.multiplier, scaled.newMultiplier) !== 0 &&
    Math.abs(now - scaled.effectiveAt) < MULTIPLIER_BUFFER_SECONDS
  )
    throw new LiveError(
      "CORPORATE_ACTION_WINDOW",
      `${entry.label} is inside a corporate-action multiplier update window. Try again in a few minutes.`,
    );
  return {
    id: entry.id,
    label: entry.label,
    issuer: entry.issuer,
    mint: entry.mint,
    exposure: {
      decimals: mint.decimals,
      displayMultiplier: scaled.multiplier,
      nextMultiplier: {
        value: scaled.newMultiplier,
        effectiveAt: scaled.effectiveAt,
      },
      // Both issuers document one scaled UI unit as one underlying share.
      sharesPerDisplayUnit: ratio(1n),
      verified: true,
      verifiedUntil: now + QUOTE_TTL_SECONDS,
      source: entry.evidence.at(-1)!,
    },
  };
}

export class BusyError extends Error {}

/** Sliding-window budget for Jupiter calls. Waits for room instead of tripping the free tier's 429. */
export class CallBudget {
  private calls: number[] = [];
  constructor(
    private readonly capacity = 9, // free tier allows 10 per 10 s; keep one spare
    private readonly windowMs = 10_000,
    private readonly maxWaitMs = 10_000,
  ) {}
  async reserve(count: number) {
    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      const now = Date.now();
      this.calls = this.calls.filter((at) => at > now - this.windowMs);
      if (this.calls.length + count <= this.capacity) {
        for (let i = 0; i < count; i++) this.calls.push(now);
        return;
      }
      const freeAt =
        this.calls[this.calls.length + count - this.capacity - 1]! +
        this.windowMs;
      if (freeAt > deadline) throw new BusyError();
      await new Promise((resolve) => setTimeout(resolve, freeAt - now + 25));
    }
  }
  reset() {
    this.calls = [];
  }
}
export const jupiterBudget = new CallBudget();

type Order = Awaited<ReturnType<JupiterClient["quote"]>>;
const feeLamports = (order: Order) =>
  BigInt(
    (order.signatureFeeLamports ?? 0) +
      (order.prioritizationFeeLamports ?? 0) +
      (order.rentFeeLamports ?? 0),
  );

export async function liveComparison(
  request: ComparisonRequest,
  deps: {
    jupiter: JupiterClient;
    solana: SolanaClient;
    budget?: CallBudget;
    clock?: () => number;
    /** Set when wallet buying is enabled on this deployment. */
    executionMaxUsdc?: string;
  },
): Promise<Comparison> {
  const asset = findAsset(request.ticker);
  if (!asset)
    throw new LiveError(
      "UNSUPPORTED_ASSET",
      `${request.ticker} is not verified for live comparison yet.`,
    );
  const clock = deps.clock ?? (() => Math.floor(Date.now() / 1000));
  const total = parseUnits(request.amount, 6);
  const half = total / 2n;
  // Full order on each wrapper plus one 50/50 split: four quotes fit the free tier's burst.
  const samples = asset.wrappers.flatMap((wrapper, index) =>
    [...new Set([index === 0 ? half : total - half, total])]
      .filter((input) => input > 0n)
      .map((input) => ({ wrapper, input })),
  );
  await deps.budget?.reserve(samples.length);
  const [chain, ...settled] = await Promise.all([
    deps.solana.mints(asset.wrappers.map((w) => w.mint)),
    ...samples.map(({ wrapper, input }) =>
      deps.jupiter.quote(wrapper.mint, input).then(
        (order) => ({ ok: true as const, order }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    ),
  ]);
  const now = clock();
  const wrappers = asset.wrappers.map((entry, index) =>
    admit(entry, chain.mints[index]!, now),
  );
  const orders = samples.flatMap((sample, index) => {
    const result = settled[index]!;
    return result.ok ? [{ ...sample, order: result.order }] : [];
  });
  const lamports = orders.reduce(
    (sum, { order }) => sum + feeLamports(order),
    0n,
  );
  if (lamports > 0n) await deps.budget?.reserve(1);
  const solUsd = lamports > 0n ? await deps.jupiter.solUsd() : ratio(0n);
  const quotes: Quote[] = orders.map(({ wrapper, input, order }) => ({
    wrapperId: wrapper.id,
    inputRaw: input,
    outputRaw: BigInt(order.outAmount),
    minimumOutputRaw: BigInt(order.otherAmountThreshold ?? order.outAmount),
    networkFeeUsd: multiply(ratio(feeLamports(order), 1_000_000_000n), solUsd),
    quotedAt: now,
    expiresAt: now + QUOTE_TTL_SECONDS,
    poolIds: order.routePlan?.flatMap((step) => step.swapInfo.ammKey ?? []) ?? [
      `router:${order.router}`,
    ],
  }));
  const fullShares = quotes
    .filter((q) => q.inputRaw === total)
    .map((q) =>
      normalizeShares(
        q.outputRaw,
        wrappers.find((w) => w.id === q.wrapperId)!.exposure,
        now,
      ),
    )
    .sort((a, b) => compare(b, a));
  if (!fullShares[0]) {
    const limited = settled.some(
      (r) =>
        !r.ok &&
        r.error instanceof ProviderError &&
        r.error.code === "rate-limited",
    );
    if (limited) throw new ProviderError("rate-limited", "Jupiter");
    throw new LiveError(
      "NO_BASELINE",
      "Jupiter returned no full-size quote for either wrapper at this amount.",
    );
  }
  // Fees are valued at the best observed full-order cost per share; USDC treated at par for fees only.
  const shareValueUsd: Ratio = divide(ratio(total, 1_000_000n), fullShares[0]);
  const result = optimize({ total, wrappers, quotes, shareValueUsd, now });
  const session = usEquitySession(now);
  const routers = Object.fromEntries(
    orders
      .filter(({ input }) => input === total)
      .map(({ wrapper, order }) => [
        wrapper.id,
        order.swapType ? `${order.router} · ${order.swapType}` : order.router,
      ]),
  );
  const unavailable = wrappers
    .filter(
      (w) => !quotes.some((q) => q.wrapperId === w.id && q.inputRaw === total),
    )
    .map((w) => `${w.label}: no Jupiter quote at this size`);
  const feeTotal = quotes.reduce(
    (sum, q) => add(sum, q.networkFeeUsd),
    ratio(0n),
  );
  return presentComparison({
    mode: "live",
    ticker: asset.ticker,
    total,
    now,
    expiresAt: now + QUOTE_TTL_SECONDS,
    session,
    reference: null,
    wrappers,
    quotes,
    routers,
    result,
    slot: chain.slot,
    reasons: [
      deps.executionMaxUsdc
        ? `Buying is capped at ${deps.executionMaxUsdc} USDC per order and always needs your wallet's approval`
        : "Read-only comparison — wallet execution is not enabled in this build",
      ...(session === "open"
        ? []
        : [
            "US market closed — wrapper quotes may carry wider off-hours spreads",
          ]),
      ...unavailable,
      ...(result.best.sharedLiquidity
        ? [
            "Split legs draw on the same liquidity source; each leg must be re-quoted",
          ]
        : []),
      ...(feeTotal.n === 0n
        ? [
            deps.executionMaxUsdc
              ? "Comparison quotes report no network fee; a real buy shows its exact SOL cost before you sign"
              : "Quoted routes report zero network fee (gasless RFQ)",
          ]
        : []),
    ],
  });
}

// Identical requests within a few seconds share one upstream fan-out (free-tier friendly).
const recent = new Map<
  string,
  { until: number; result: Promise<Comparison> }
>();
// The call budget queues bursts; this caps how many requests may wait on it at once.
const MAX_IN_FLIGHT = 3;
let inFlight = 0;

export function cachedLiveComparison(
  request: ComparisonRequest,
  deps: Parameters<typeof liveComparison>[1],
): Promise<Comparison> {
  const key = `${request.ticker}:${parseUnits(request.amount, 6)}`;
  const nowMs = Date.now();
  for (const [k, entry] of recent) if (entry.until <= nowMs) recent.delete(k);
  const hit = recent.get(key);
  if (hit) return hit.result;
  if (inFlight >= MAX_IN_FLIGHT) return Promise.reject(new BusyError());
  inFlight++;
  const result = liveComparison(request, deps).finally(() => inFlight--);
  recent.set(key, { until: nowMs + 8_000, result });
  result.catch(() => recent.delete(key));
  return result;
}

function wrapperEntry(ticker: string, wrapper: string) {
  const entry = findAsset(ticker)?.wrappers.find((w) => w.id === wrapper);
  if (!entry)
    throw new LiveError(
      "UNSUPPORTED_ASSET",
      `${ticker} is not verified for live comparison yet.`,
    );
  return entry;
}
/** Jupiter reports RFQ expiry as a timestamp; aggregator routes use block height instead. */
function orderExpiry(value: string | number | null | undefined, now: number) {
  let at =
    typeof value === "number"
      ? value
      : value && /^\d+$/.test(value)
        ? Number(value)
        : value
          ? Date.parse(value) / 1000
          : Number.NaN;
  if (at > 1e12) at /= 1000;
  return Number.isFinite(at)
    ? Math.min(Math.floor(at), now + 60)
    : now + QUOTE_TTL_SECONDS;
}

/** A signable buy of one verified wrapper, re-checked against chain state. The server never signs. */
export async function prepareBuy(
  request: BuyRequest,
  deps: {
    jupiter: JupiterClient;
    solana: SolanaClient;
    maxInputRaw: bigint;
    budget?: CallBudget;
    clock?: () => number;
  },
): Promise<BuyQuote> {
  const entry = wrapperEntry(request.ticker, request.wrapper);
  const total = parseUnits(request.amount, 6);
  if (total > deps.maxInputRaw)
    throw new LiveError(
      "OVER_LIMIT",
      `Buying is capped at ${format(ratio(deps.maxInputRaw, 1_000_000n), 2)} USDC per order during the launch.`,
    );
  await deps.budget?.reserve(1);
  const [chain, order] = await Promise.all([
    deps.solana.mints([entry.mint]),
    deps.jupiter.order(entry.mint, total, request.taker),
  ]);
  const now = (deps.clock ?? (() => Math.floor(Date.now() / 1000)))();
  const wrapper = admit(entry, chain.mints[0]!, now);
  const expiresAt = orderExpiry(order.expireAt, now);
  const out = BigInt(order.outAmount);
  const minimum = BigInt(order.otherAmountThreshold ?? order.outAmount);
  return {
    requestId: order.requestId,
    transaction: order.transaction,
    label: entry.label,
    issuer: entry.issuer,
    mint: entry.mint,
    amount: format(ratio(total, 1_000_000n), 6),
    tokens: format(ratio(out, 10n ** BigInt(entry.decimals)), 6),
    shares: format(normalizeShares(out, wrapper.exposure, now, expiresAt), 6),
    minimumShares: format(
      normalizeShares(minimum, wrapper.exposure, now, expiresAt),
      6,
    ),
    router: order.swapType
      ? `${order.router} · ${order.swapType}`
      : order.router,
    gasless: order.gasless === true,
    networkFeeSol: format(
      ratio(
        BigInt(
          (order.signatureFeeLamports ?? 0) +
            (order.prioritizationFeeLamports ?? 0),
        ),
        1_000_000_000n,
      ),
      6,
    ),
    accountDepositSol: format(
      ratio(BigInt(order.rentFeeLamports ?? 0), 1_000_000_000n),
      6,
    ),
    expiresAt,
  };
}

function failureMessage(code: number) {
  if (code <= -2000)
    return "The market maker did not fill this order. Nothing was bought — get a new quote.";
  if (code <= -1000)
    return "The transaction did not land. Nothing should have been bought — check Solscan if a signature is shown.";
  if (code < 0)
    return "The quote expired or was already used. Nothing was bought — get a new quote.";
  return "The swap failed. Nothing was bought.";
}

/** Forwards a wallet-signed order once. The caller must not resubmit on an unknown outcome. */
export async function settleBuy(
  request: ExecuteRequest,
  deps: { jupiter: JupiterClient; solana: SolanaClient; clock?: () => number },
): Promise<BuyResult> {
  const entry = wrapperEntry(request.ticker, request.wrapper);
  const result = await deps.jupiter.execute(
    request.requestId,
    request.signedTransaction,
  );
  const paid = result.totalInputAmount
    ? format(ratio(BigInt(result.totalInputAmount), 1_000_000n), 6)
    : null;
  if (result.status !== "Success")
    return {
      status: "failed",
      signature: result.signature ?? null,
      message: failureMessage(result.code),
      paid: null,
      receivedShares: null,
    };
  let receivedShares: string | null = null;
  try {
    // Report received shares with the multiplier in force now; the purchase already happened.
    const now = (deps.clock ?? (() => Math.floor(Date.now() / 1000)))();
    const chain = await deps.solana.mints([entry.mint]);
    const wrapper = admit(entry, chain.mints[0]!, now);
    if (result.totalOutputAmount)
      receivedShares = format(
        normalizeShares(
          BigInt(result.totalOutputAmount),
          wrapper.exposure,
          now,
        ),
        6,
      );
  } catch {
    receivedShares = null;
  }
  return {
    status: "confirmed",
    signature: result.signature ?? null,
    message: `Bought ${entry.label} on Solana mainnet.`,
    paid,
    receivedShares,
  };
}
