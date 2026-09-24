import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { jupiterBudget, liveComparison } from "../src/server/live";
import { JupiterClient } from "../src/server/providers/jupiter";
import { SolanaClient } from "../src/server/providers/solana";
import { verifiedAssets } from "../src/server/registry";

// Opt-in, read-only mainnet check of every admitted stock (no wallet, no transaction):
// LIVE_SMOKE=1 node --env-file=.env.local node_modules/.bin/vitest run tests/live.smoke.test.ts
// LIVE_SMOKE_TICKERS=AAPL,NVDA and LIVE_SMOKE_AMOUNT=10000 narrow the run.
const enabled = process.env.LIVE_SMOKE === "1";
const tickers =
  process.env.LIVE_SMOKE_TICKERS?.split(",") ??
  verifiedAssets.map((asset) => asset.ticker);
describe.skipIf(!enabled)("live mainnet smoke", () => {
  it.each(tickers)(
    "%s compares both issuers from real quotes",
    async (ticker) => {
      const result = await liveComparison(
        {
          ticker,
          amount: process.env.LIVE_SMOKE_AMOUNT ?? "10000",
          scenario: "normal",
        },
        {
          jupiter: new JupiterClient(process.env.JUPITER_API_KEY ?? ""),
          solana: new SolanaClient(process.env.SOLANA_RPC_URL ?? ""),
          budget: jupiterBudget,
        },
      );
      const quoted = result.wrappers.filter((w) => w.status === "quoted");
      const line = `${ticker}: ${result.wrappers
        .map(
          (w) =>
            `${w.label} ${w.pricePerShare ?? "no quote"} (${w.spreadBps ?? "-"} bps)`,
        )
        .join(" | ")}`;
      if (process.env.LIVE_SMOKE_OUT)
        (await import("node:fs")).appendFileSync(
          process.env.LIVE_SMOKE_OUT,
          line + "\n",
        );
      expect(result.mode).toBe("live");
      expect(quoted.length).toBeGreaterThan(0);
      // Independent issuers must agree on cost per share; a unit error would be orders of magnitude off.
      if (quoted.length === 2)
        expect(
          Number(quoted.find((w) => w.spreadBps !== "0.0")?.spreadBps ?? 0),
        ).toBeLessThan(200);
    },
    30_000,
  );
});
