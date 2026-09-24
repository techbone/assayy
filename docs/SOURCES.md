# Integration decisions and sources

Reviewed September 24, 2026. Provider documentation can change; live contract checks remain mandatory.

- [Stocklana rules](https://hackathons.solana.com/hackathons/stocklana): cutoff Sep 25 at 4 PM ET; original work; link requirement; Pyth bounty emphasizes data centrality. Main track + Pyth are the intended tracks. This is not a submitted entry yet.
- [Jupiter v2 order/execute](https://developers.jup.ag/docs/swap/order-and-execute): recommended managed order flow; quotes without taker; requestId required for execution; router-specific behavior and fees. Legacy v1 tutorials are not the integration baseline.
- [Jupiter plans](https://developers.jup.ag/pricing): free API tier 1 RPS at time of review. Bounded quote sampling, not unlimited parallel fan-out.
- [Pyth Core upgrade](https://docs.pyth.network/price-feeds/core/upgrade/preparing): API-key authentication required after Aug 26; upgraded Hermes endpoint.
- [Pyth fetch updates](https://docs.pyth.network/price-feeds/core/fetch-price-updates): batch feed IDs, parsed price/confidence/exponent/timestamp.
- [Pyth Pro REST](https://docs.pyth.network/price-feeds/pro/api/rest): separate authenticated REST path; do not assume every bounty feed is accessible through Hermes or a free key.
- [Pyth Solana sponsored push feeds](https://docs.pyth.network/price-feeds/core/push-feeds/solana): AAPL was absent from the published mainnet push list on September 24, 2026; do not assume a free fresh on-chain Apple feed.
- [Pyth Benchmarks migration](https://docs.pyth.network/price-feeds/core/use-historical-price-data): historical endpoints also require a bearer API key after the August 2026 upgrade.
- [Solana Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount): current/scheduled multipliers; raw balances unchanged; floating-point conversion caveats.
- [xStocks bridge explanation](https://xstocks.com/news/introducing-the-xbridge): issuer's Solana rebasing/multiplier model.
- [Ondo total-return explanation](https://ondo.finance/learn/tokenized-rwas/tokenized-stocks-and-etfs): dividends reinvest into underlying shares; cannot assume token-count increases or raw 1:1 share exposure.
- [Ondo stocks overview](https://ondo.finance/ondo-stocks): issuer differences, asset availability and access conditions.
- [xStocks multipliers for developers](https://docs.xstocks.fi/developers/multipliers): `scaledAmount = rawAmount × multiplier`; one scaled unit is one share; pause around activation. Basis for the admitted AAPLx conversion.
- [Ondo token and quote pricing](https://docs.ondo.finance/ondo-global-markets/token-and-quote-pricing): display multiplier makes displayed units trade at the stock price (one unit = one share). Basis for the admitted AAPLon conversion.
- [xStocks public assets API](https://api.xstocks.fi/api/v2/public/assets): issuer-published xStock list with Solana deployment addresses; source for every admitted xStocks mint.
- [Backed AAPLx final terms](https://www.lb.lt/uploads/prospectuses/docs/56851_d75fd29bdc01e77344e458eb95100611.pdf): includes the Solana mint address listed for the AAPLx product. This does not prove that raw on-chain tokens equal exactly one share.
- [Ondo Solana simulator mint list](https://github.com/ondoprotocol/gm-solana-simulator/blob/main/constants.rs): Ondo-maintained code lists every admitted Ondo mainnet mint, including AAPLon. Confirmed against the mint account and its Ondo-hosted metadata URI.

No production Pyth feed ID has been admitted. All 17 admitted pairs and their share conversion are admitted in `src/server/registry.ts` on the issuer documents above, cross-checked against mainnet mint state (see docs/VALIDATION.md). Search results alone were not relied on.
