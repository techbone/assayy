import "server-only";
import { z } from "zod";
import { parseUnits } from "../domain/amount";

const schema = z.object({
  ASSAY_MODE: z.enum(["demo", "live"]).default("demo"),
  JUPITER_API_KEY: z.string().default(""),
  PYTH_API_KEY: z.string().default(""),
  SOLANA_RPC_URL: z
    .union([
      z.literal(""),
      z.url().refine((value) => value.startsWith("https://")),
    ])
    .default(""),
  // Wallet buying is opt-in and capped; the cap can never exceed 25 USDC.
  ASSAY_EXECUTION: z.enum(["off", "on"]).default("off"),
  EXECUTION_MAX_USDC: z
    .string()
    .default("5")
    .refine((value) => {
      try {
        const raw = parseUnits(value, 6);
        return raw >= 1_000_000n && raw <= 25_000_000n;
      } catch {
        return false;
      }
    }),
});
export function configuration() {
  const config = schema.parse(process.env);
  return {
    mode: config.ASSAY_MODE,
    jupiterKey: config.JUPITER_API_KEY,
    pythKey: config.PYTH_API_KEY,
    rpcUrl: config.SOLANA_RPC_URL,
    execution:
      config.ASSAY_EXECUTION === "on" &&
      config.ASSAY_MODE === "live" &&
      Boolean(config.JUPITER_API_KEY && config.SOLANA_RPC_URL),
    executionMaxRaw: parseUnits(config.EXECUTION_MAX_USDC, 6),
  };
}
