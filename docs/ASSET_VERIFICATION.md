# Asset admission gate

Start with one underlying, ideally AAPL. Do not assume the bounty's example names prove current feed access, mint identity, economic equivalence or executable Jupiter routes.

For each wrapper record the following in a reviewed registry entry:

| Evidence            | Required data                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Issuer identity     | Official issuer page/document, network, exact mint address, retrieval date                                                          |
| Chain state         | Mainnet account owner, mint decimals, token program, initialized state, freeze/mint authorities, extensions and observed slot       |
| Corporate actions   | Active display multiplier, scheduled multiplier and effective timestamp, relevant halt status                                       |
| Economic conversion | Issuer-sourced shares-per-display-unit or shares-per-raw-token model; dividend and split treatment; validity interval               |
| Price semantics     | Exact Pyth feed IDs and symbols; whether feed is equity/share, raw token, scaled token or total-return token; Core/Pro availability |
| Liquidity           | Jupiter exact mint pair at small and large sizes, output/minimum output, route/router, timestamp, fees, errors                      |
| Access              | Issuer restrictions and whether the app/route needs access checks; no assumption that transferability removes restrictions          |

Review issuer mint evidence against RPC and Jupiter; symbol or a token-list “verified” badge alone is insufficient. Token-2022 transfer fees, hooks, confidential features, permanent delegates and other extensions need explicit support/review. Unknown semantics must fail closed.

Never derive the share ratio from the same market price being compared. That creates a circular fair-value calculation. Do not double-apply a UI multiplier when an issuer ratio already describes raw tokens. Do not treat wrapper Pyth prices as an issuer NAV unless documented.

## Discovery workflow

1. Configure secrets locally and run `npm run discover` for untrusted candidate feeds/mints.
2. Locate issuer evidence for each exact candidate. Record evidence URL and meaningful extracted fields, not only a homepage.
3. Implement the RPC mint reader and compare metadata with issuer data. Use exact multiplier decoding.
4. Confirm authenticated price access and fresh semantics. If a feed is Pro-only, the Hermes adapter cannot substitute for it.
5. Read-only quotes at 1/10/100/10,000/250,000 USDC; unavailable routes are a normal result. Do not buy these amounts.
6. Enable only the validated pair in the registry, with a normalization expiry and independent evidence source.
7. Contract tests use sanitized captured responses. Live smoke checks are separate and opt-in.

The live registry contains one market, AAPL (AAPLx + AAPLon), admitted September 24, 2026. Each entry records mint, decimals, metadata symbol, exact Token-2022 extension set and issuer evidence URLs. The share ratio is not stored: it is read on each request from the on-chain Scaled UI multiplier, as both issuers document. The price-semantics row stays open because no Pyth feed has been verified. NVDA and other tickers remain unadmitted. Ratios and prices in `src/fixtures/` are synthetic and cannot be used for signing.
