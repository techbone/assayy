// Read-only discovery. Results are candidates, never automatically trusted assets.
// This script never loads a wallet, signs a transaction, or prints API keys.
const pythKey = process.env.PYTH_API_KEY;
const jupiterKey = process.env.JUPITER_API_KEY;
if (!jupiterKey) {
  console.error("Set JUPITER_API_KEY in .env.local before discovery.");
  process.exitCode = 1;
} else {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function get(url, headers, provider) {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`${provider} returned HTTP ${response.status}`);
    return response.json();
  }
  try {
    for (const ticker of ["AAPL", "NVDA"]) {
      const feeds = pythKey
        ? await get(
            `https://pyth.dourolabs.app/hermes/v2/price_feeds?query=${ticker}`,
            { Authorization: `Bearer ${pythKey}` },
            "Pyth",
          )
        : [];
      if (!Array.isArray(feeds))
        throw new Error("Unexpected Pyth discovery shape");
      const symbols = new Set([
        `Equity.US.${ticker}/USD`,
        `Crypto.${ticker}X/USD`,
        `Crypto.${ticker}ON/USD`,
      ]);
      const selected = feeds.filter((feed) =>
        symbols.has(feed.attributes?.symbol),
      );
      const tokens = await get(
        `https://api.jup.ag/tokens/v2/search?query=${ticker}`,
        { "x-api-key": jupiterKey },
        "Jupiter",
      );
      if (!Array.isArray(tokens))
        throw new Error("Unexpected Jupiter discovery shape");
      const tokenSymbols = new Set([
        `${ticker}x`.toLowerCase(),
        `${ticker}on`.toLowerCase(),
      ]);
      console.log(
        JSON.stringify(
          {
            ticker,
            status: "UNVERIFIED_CANDIDATES",
            pythDiscovery: pythKey ? "queried" : "skipped_no_key",
            feeds: selected.map((feed) => ({
              id: feed.id,
              symbol: feed.attributes.symbol,
            })),
            tokens: tokens
              .filter((token) => tokenSymbols.has(token.symbol?.toLowerCase()))
              .map((token) => ({
                mint: token.id,
                symbol: token.symbol,
                decimals: token.decimals,
                isVerifiedByJupiter: token.isVerified,
              })),
          },
          null,
          2,
        ),
      );
      await wait(1100);
    }
  } catch (error) {
    // Do not log arbitrary network error text: it can contain URLs/credentials.
    console.error(
      error instanceof Error && /^(Pyth|Jupiter|Unexpected)/.test(error.message)
        ? error.message
        : "Provider discovery failed. Check network access and credentials.",
    );
    process.exitCode = 1;
  }
}
