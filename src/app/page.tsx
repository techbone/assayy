import { Workbench } from "../components/workbench";
import { format, ratio } from "../domain/amount";
import { DEMO_STOCKS } from "../fixtures/comparison";
import { configuration } from "../server/config";
import { verifiedAssets } from "../server/registry";

export const dynamic = "force-dynamic";
export default function Home() {
  let mode: "demo" | "live" | "unavailable" = "unavailable";
  let maxBuyUsdc: string | null = null;
  try {
    const config = configuration();
    if (config.execution)
      maxBuyUsdc = format(ratio(config.executionMaxRaw, 1_000_000n), 0);
    mode =
      config.mode === "demo" || (config.jupiterKey && config.rpcUrl)
        ? config.mode
        : "unavailable";
  } catch {
    /* API health explains configuration failure. */
  }
  const stocks =
    mode === "demo"
      ? DEMO_STOCKS.map(({ ticker, name }) => ({ ticker, name }))
      : verifiedAssets.map(({ ticker, name }) => ({ ticker, name }));
  return <Workbench mode={mode} stocks={stocks} maxBuyUsdc={maxBuyUsdc} />;
}
