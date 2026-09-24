import "server-only";
import { z } from "zod";
import { fromExponent } from "../../domain/amount";
import type { OraclePrice } from "../../domain/types";
import { fetchValidated, ProviderError } from "./http";

const feedId = z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/);
const priceSchema = z.object({
  price: z.string().regex(/^-?\d{1,38}$/),
  conf: z.string().regex(/^\d{1,38}$/),
  expo: z.number().int().min(-38).max(38),
  publish_time: z.number().int().nonnegative().safe(),
});
const responseSchema = z.object({
  parsed: z.array(z.object({ id: feedId, price: priceSchema })).max(20),
});
const canonical = (id: string) => id.replace(/^0x/, "").toLowerCase();

export class PythClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async prices(ids: readonly string[]): Promise<OraclePrice[]> {
    if (!this.apiKey || !ids.length || ids.length > 20)
      throw new Error("Pyth configuration or feed count invalid");
    const requested = ids.map((id) => canonical(feedId.parse(id)));
    if (new Set(requested).size !== requested.length)
      throw new Error("Duplicate feed ID");
    const url = new URL(
      "https://pyth.dourolabs.app/hermes/v2/updates/price/latest",
    );
    requested.forEach((id) => url.searchParams.append("ids[]", id));
    const response = await fetchValidated(
      "Pyth",
      url,
      responseSchema,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
      this.fetcher,
    );
    if (
      response.parsed.length !== requested.length ||
      new Set(response.parsed.map((p) => canonical(p.id))).size !==
        requested.length ||
      response.parsed.some((p) => !requested.includes(canonical(p.id)))
    )
      throw new ProviderError("invalid-response", "Pyth");
    return requested.map((id) => {
      const item = response.parsed.find((p) => canonical(p.id) === id)!;
      return {
        id,
        usd: fromExponent(item.price.price, item.price.expo),
        confidenceUsd: fromExponent(item.price.conf, item.price.expo),
        publishedAt: item.price.publish_time,
      };
    });
  }
}
