import { buyRequest } from "../../../../domain/contracts";
import { configuration } from "../../../../server/config";
import { jsonResponder, readJson } from "../../../../server/http-json";
import {
  BusyError,
  jupiterBudget,
  LiveError,
  prepareBuy,
} from "../../../../server/live";
import { ProviderError } from "../../../../server/providers/http";
import {
  JupiterClient,
  OrderRejected,
} from "../../../../server/providers/jupiter";
import { SolanaClient } from "../../../../server/providers/solana";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const { ok, fail } = jsonResponder();
  let config;
  try {
    config = configuration();
  } catch {
    return fail(503, "Buying unavailable");
  }
  if (!config.execution)
    return fail(
      403,
      "Buying is not enabled on this deployment",
      "EXECUTION_OFF",
    );
  const body = await readJson(request, buyRequest);
  if ("error" in body) return fail(400, body.error);
  try {
    return ok(
      await prepareBuy(body.data, {
        jupiter: new JupiterClient(config.jupiterKey),
        solana: new SolanaClient(config.rpcUrl),
        maxInputRaw: config.executionMaxRaw,
        budget: jupiterBudget,
      }),
    );
  } catch (error) {
    if (error instanceof OrderRejected)
      return fail(422, error.message, "ORDER_REJECTED");
    if (error instanceof LiveError)
      return fail(
        error.code === "UNSUPPORTED_ASSET" || error.code === "OVER_LIMIT"
          ? 400
          : 503,
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
      );
    if (error instanceof ProviderError)
      return fail(
        503,
        `${error.provider} is unavailable right now (${error.code}).`,
        "PROVIDER_UNAVAILABLE",
      );
    return fail(503, "Buying unavailable");
  }
}
