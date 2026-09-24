import "server-only";
import { z } from "zod";

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
});
export function configuration() {
  const config = schema.parse(process.env);
  return {
    mode: config.ASSAY_MODE,
    jupiterKey: config.JUPITER_API_KEY,
    pythKey: config.PYTH_API_KEY,
    rpcUrl: config.SOLANA_RPC_URL,
  };
}
