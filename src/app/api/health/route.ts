import { configuration } from "../../../server/config";
import { verifiedAssets } from "../../../server/registry";

export const dynamic = "force-dynamic";
export function GET() {
  try {
    const config = configuration();
    return Response.json(
      {
        status: "ok",
        mode: config.mode,
        network: "solana-mainnet-beta",
        executionEnabled: config.execution,
        executionMaxUsdc: config.execution
          ? (Number(config.executionMaxRaw) / 1e6).toString()
          : null,
        configured: {
          jupiter: Boolean(config.jupiterKey),
          pyth: Boolean(config.pythKey),
          rpc: Boolean(config.rpcUrl),
        },
        verifiedAssets: verifiedAssets.map((asset) => asset.ticker),
        liveReady:
          config.mode === "live" &&
          Boolean(config.jupiterKey && config.rpcUrl) &&
          verifiedAssets.length > 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "configuration-error" }, { status: 503 });
  }
}
