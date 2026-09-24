import { executeRequest } from "../../../../domain/contracts";
import { configuration } from "../../../../server/config";
import { jsonResponder, readJson } from "../../../../server/http-json";
import { LiveError, settleBuy } from "../../../../server/live";
import { ProviderError } from "../../../../server/providers/http";
import { JupiterClient } from "../../../../server/providers/jupiter";
import { SolanaClient } from "../../../../server/providers/solana";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
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
  const body = await readJson(request, executeRequest);
  if ("error" in body) return fail(400, body.error);
  try {
    return ok(
      await settleBuy(body.data, {
        jupiter: new JupiterClient(config.jupiterKey),
        solana: new SolanaClient(config.rpcUrl),
      }),
    );
  } catch (error) {
    if (error instanceof LiveError) return fail(400, error.message, error.code);
    // Once a signed transaction has been handed over, any failure to hear back is an unknown outcome.
    if (error instanceof ProviderError && error.code !== "rate-limited")
      return fail(
        504,
        "We could not confirm the result. Check your wallet or Solscan before trying again — do not resubmit.",
        "OUTCOME_UNKNOWN",
      );
    if (error instanceof ProviderError)
      return fail(
        429,
        "Jupiter is busy and did not accept the order. Nothing was sent — get a new quote.",
        "RATE_LIMITED",
      );
    return fail(
      504,
      "We could not confirm the result. Check your wallet or Solscan before trying again — do not resubmit.",
      "OUTCOME_UNKNOWN",
    );
  }
}
