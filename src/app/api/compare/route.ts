import { comparisonRequest } from "../../../domain/contracts";
import { demoComparison } from "../../../fixtures/comparison";
import { configuration } from "../../../server/config";
import {
  BusyError,
  cachedLiveComparison,
  LiveError,
} from "../../../server/live";
import { ProviderError } from "../../../server/providers/http";
import { JupiterClient } from "../../../server/providers/jupiter";
import { SolanaClient } from "../../../server/providers/solana";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  const fail = (
    status: number,
    error: string,
    code?: string,
    extra: Record<string, string> = {},
  ) =>
    Response.json(
      { error, ...(code ? { code } : {}), requestId },
      { status, headers: { ...headers, ...extra } },
    );
  const params = new URL(request.url).searchParams;
  if (Array.from(params.keys()).length !== new Set(params.keys()).size)
    return fail(400, "Duplicate query parameter");
  const parsed = comparisonRequest.safeParse(Object.fromEntries(params));
  if (!parsed.success)
    return fail(400, parsed.error.issues[0]?.message ?? "Invalid request");
  let config;
  try {
    config = configuration();
  } catch {
    return fail(503, "Comparison unavailable");
  }
  if (config.mode === "demo")
    return Response.json(demoComparison(parsed.data), { headers });
  if (!config.jupiterKey || !config.rpcUrl)
    return fail(
      503,
      "Live comparison needs a Jupiter key and Solana RPC. Demo data is never substituted for live data.",
      "LIVE_NOT_READY",
    );
  if (parsed.data.scenario !== "normal")
    return fail(400, "Market scenarios are available in demo mode only");
  try {
    const result = await cachedLiveComparison(parsed.data, {
      jupiter: new JupiterClient(config.jupiterKey),
      solana: new SolanaClient(config.rpcUrl),
    });
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof LiveError)
      return fail(
        error.code === "UNSUPPORTED_ASSET" ? 422 : 503,
        error.message,
        error.code,
      );
    if (
      error instanceof BusyError ||
      (error instanceof ProviderError && error.code === "rate-limited")
    )
      return fail(
        429,
        "Quote sources are busy. Try again in a few seconds.",
        "RATE_LIMITED",
        { "Retry-After": "10" },
      );
    if (error instanceof ProviderError)
      return fail(
        503,
        `${error.provider} is unavailable right now (${error.code}). No cached or demo data is shown.`,
        "PROVIDER_UNAVAILABLE",
      );
    return fail(503, "Comparison unavailable");
  }
}
