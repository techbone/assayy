import { z } from "zod";

export class ProviderError extends Error {
  constructor(
    public readonly code:
      "timeout" | "unavailable" | "rate-limited" | "invalid-response",
    public readonly provider: string,
  ) {
    super(`${provider}: ${code}`);
  }
}
export async function fetchValidated<T>(
  provider: string,
  url: URL,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  try {
    const response = await fetcher(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 429)
      throw new ProviderError("rate-limited", provider);
    if (!response.ok) throw new ProviderError("unavailable", provider);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new ProviderError("invalid-response", provider);
    return parsed.data;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      throw new ProviderError("timeout", provider);
    throw new ProviderError("unavailable", provider);
  }
}
