import "server-only";
import { z } from "zod";
import { decodeMint, type DecodedMint } from "../../domain/mint";
import { fetchValidated, ProviderError } from "./http";

const responseSchema = z.object({
  result: z.object({
    context: z.object({ slot: z.number().int().nonnegative() }),
    value: z.array(
      z
        .object({
          owner: z.string(),
          data: z.tuple([z.string().max(20_000), z.literal("base64")]),
        })
        .nullable(),
    ),
  }),
});

/** Read-only mint reader. Only getMultipleAccounts is called; no keys or wallets. */
export class SolanaClient {
  constructor(
    private readonly rpcUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async mints(
    addresses: readonly string[],
  ): Promise<{ slot: number; mints: (DecodedMint & { owner: string })[] }> {
    if (!this.rpcUrl || !addresses.length || addresses.length > 10)
      throw new Error("Invalid RPC configuration or account count");
    const body = await fetchValidated(
      "Solana RPC",
      new URL(this.rpcUrl),
      responseSchema,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getMultipleAccounts",
          params: [addresses, { encoding: "base64", commitment: "confirmed" }],
        }),
      },
      this.fetcher,
    );
    const accounts = body.result.value;
    if (accounts.length !== addresses.length)
      throw new ProviderError("invalid-response", "Solana RPC");
    try {
      return {
        slot: body.result.context.slot,
        mints: accounts.map((account) => {
          if (!account) throw new Error("Missing mint account");
          return {
            owner: account.owner,
            ...decodeMint(
              new Uint8Array(Buffer.from(account.data[0], "base64")),
            ),
          };
        }),
      };
    } catch {
      throw new ProviderError("invalid-response", "Solana RPC");
    }
  }
}
