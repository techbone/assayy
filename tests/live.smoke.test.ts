import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { liveComparison } from "../src/server/live";
import { JupiterClient } from "../src/server/providers/jupiter";
import { SolanaClient } from "../src/server/providers/solana";

// Opt-in: LIVE_SMOKE=1 node --env-file=.env.local node_modules/.bin/vitest run tests/live.smoke.test.ts
// Read-only mainnet RPC and Jupiter quotes; no wallet, no transaction.
const enabled = process.env.LIVE_SMOKE === "1";
describe.skipIf(!enabled)("live mainnet smoke", () => {
  it("compares issuer-verified AAPL wrappers from real quotes", async () => {
    const result = await liveComparison(
      {
        ticker: "AAPL",
        amount: process.env.LIVE_SMOKE_AMOUNT ?? "10000",
        scenario: "normal",
      },
      {
        jupiter: new JupiterClient(process.env.JUPITER_API_KEY ?? ""),
        solana: new SolanaClient(process.env.SOLANA_RPC_URL ?? ""),
      },
    );
    if (process.env.LIVE_SMOKE_OUT)
      (await import("node:fs")).writeFileSync(
        process.env.LIVE_SMOKE_OUT,
        JSON.stringify(result, null, 1),
      );
    expect(result.mode).toBe("live");
    expect(result.reference).toBeNull();
    expect(result.wrappers.some((w) => w.status === "quoted")).toBe(true);
  }, 30_000);
});
