# Foundation validation — September 24, 2026

## Completed

- `npm run check`: formatting, strict TypeScript, **57 tests across 3 files**, and optimized Next.js production build passed.
- Dependency installation audit after upgrading the test runner and installing the formatter: **0 reported vulnerabilities**. This is a point-in-time dependency check, not a security audit.
- Real local HTTP checks: health 200; 250k AAPL demo comparison 200 with premium-limit reason; stale NVDA demo 200 with stale-reference reason; scientific notation and duplicate amount parameters rejected with 400. Quote responses carry `Cache-Control: no-store`.
- Contract tests: demo/live isolation, invalid mode, unknown fields/tickers, parameter tampering and secret-free health output.
- Financial tests: u64 boundaries beyond JS safe integers, decimal rejection, oracle exponents, multiplier activation boundaries, expiring evidence, stale/future/confidence limits, USDC valuation, minimum received guard, sampled split selection, fees outweighing split benefit, missing baseline and overlapping liquidity.
- Receipt reducer tests: ambiguous submissions retain their signature and cannot restart; partial fills are not marked complete.
- Provider contract tests with mocked responses: authenticated Pyth endpoint, feed identity, raw string amounts, Jupiter mint/input binding, overflow/errors/rate limits and sanitized failures. These are **not live integration tests**.
- Browser preview: normal comparison, 250k sample, closed-market block, invalid-amount error, edits clearing old results, and desktop/phone layouts. Checked 1280px desktop and 390px phone viewports; phone content width equaled viewport width (no horizontal overflow).
- UI refinement: inspected dark and light themes at phone and desktop widths. The theme toggle stayed selected after a reload, and both themes fit the 390px viewport without horizontal overflow.

## Pending before release

Authenticated live feed/quote compatibility, issuer-verified mints and exposure, mint extension decoding, live market calendar, provider quotas/abuse controls, wallet integration, transaction inspection, simulation, signing, account balances/rent estimates, submission/confirmation, persistent receipts and reconciliation, real mainnet transaction, public hosting and submission.

The current build has no wallet execution path and spends no funds. The live registry remains empty. The pure execution reducer is groundwork, not proof that recovery works across browsers, routers or reloads. No large-value execution or load-capacity claim has been validated.

## Live read-only probe — September 24, 2026, ~10:30 UTC

- Local configuration now contains a syntactically valid Solana mainnet RPC URL and a Jupiter key; Pyth access is still unavailable. No key or wallet material was printed, and no transaction was created or sent.
- Public mainnet `getSlot` returned slot `450001071`. `getMultipleAccounts` returned initialized Token-2022 mint accounts for candidate AAPLx (`XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`, 8 decimals) and AAPLon (`123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo`, 9 decimals). Both currently report `paused: false`. Each has a Scaled UI Amount extension, permanent or other privileged authorities, and additional extensions requiring review. The RPC's xStock scheduled multiplier timestamp is already in the past; production code must determine the effective multiplier from raw account state rather than assume the `multiplier` field is active.
- Each mint's on-chain metadata URI returned a matching issuer name/symbol. The [Backed AAPLx final terms](https://www.lb.lt/uploads/prospectuses/docs/56851_d75fd29bdc01e77344e458eb95100611.pdf) and [Ondo's published Solana mint list](https://github.com/ondoprotocol/gm-solana-simulator/blob/main/constants.rs) independently list the exact candidate mint addresses. This establishes identity, not equal economic exposure.
- Jupiter v2 `/swap/v2/order` returned quote-only USDC buy responses for both candidates at 10, 100, 10,000 and 250,000 USDC. At 1 USDC, AAPLx quoted; AAPLon returned HTTP 400 once and HTTP 200 on immediate reprobe. Treat small RFQ availability as intermittent, not a fixed minimum. The 100, 10,000 and 250,000 responses for AAPLon were `jupiterz` RFQ routes. Large-number quote availability does **not** prove executable liquidity or safe fill at that size. With no taker address these responses had no signable transaction.
- The current Jupiter adapter accepted the observed successful response fields without modification. `npm run discover` now works when only the Jupiter key is present, marking Pyth discovery explicitly skipped. Live comparison remains disabled until Pyth access, independently verified share conversion and request-time mint validation are implemented.
- Pyth's current public [Solana sponsored push-feed list](https://docs.pyth.network/price-feeds/core/push-feeds/solana) did not list AAPL when checked on September 24. A generic on-chain push-feed fallback is therefore not established for this product; do not present old Pythnet account examples as a fresh Solana reference.

## Live read-only comparison — September 24, 2026, ~11:35 UTC

- **Share conversion admitted from issuer documentation.** [xStocks](https://docs.xstocks.fi/developers/multipliers): `scaledAmount = rawAmount × multiplier`, one scaled unit per share, dividends and splits applied through the multiplier. [Ondo](https://docs.ondo.finance/ondo-global-markets/token-and-quote-pricing): a displayed unit is one share at the stock price after the display multiplier. Assay therefore computes `shares = raw / 10^decimals × active multiplier`, with the multiplier read from the mint at request time. The conversion is not derived from any market price.
- **Exact multiplier decoding.** A Token-2022 decoder reads `ScaledUiAmountConfig` bytes and converts the binary64 multipliers to exact rationals. Tests pin captured mainnet bytes (slot 450014709) against the RPC `jsonParsed` values. The AAPLx scheduled multiplier (1.0032690125…) became effective on 2026-08-07, while the stored `multiplier` field still reads 1.0026642075…. Using the stale field would understate AAPLx shares by ~0.06%, so the active-multiplier rule is under test.
- **Fail-closed mint admission.** Every live request re-reads both mints and requires: Token-2022 owner, initialized, registered decimals, metadata symbol, the exact admitted extension set, not paused, no transfer-hook program, and scaled UI config present. The comparison refuses to run within 15 minutes of a pending multiplier change, per xStocks integrator guidance.
- **Mainnet results (Jupiter v2 quote-only, US market closed, pre-open).** 10,000 USDC: AAPLx 29.649 share-eq ($337.28/share) vs AAPLon 29.641 ($337.37), AAPLon +2.6–3.0 bps. 250,000 USDC: gap ≤1.3 bps, AAPLx ahead by ~0.10 shares (~$35). 1 USDC: AAPLx via Metis. AAPLon was intermittently unavailable and is shown as "no quote" when missing. At these sizes the sampled 50/50 split never beat the best single wrapper, and the app says so. The routes were mostly JupiterZ RFQ quotes reporting zero network fee (gasless).
- **Free-tier budget.** The observed Jupiter limit is 10 requests per 10 seconds. One comparison costs 1 RPC call plus 4 quotes (full order on each wrapper, plus a 50/50 split), sent in parallel in ~1.2 s. Identical requests within 8 s share one fan-out. A per-instance sliding window (9 calls per 10 s) queues bursts for up to 10 s instead of hitting the limit. Up to 3 comparisons may wait at once. Overflow returns 429 with `Retry-After: 5`, and the UI retries up to twice. Stale or demo data is never shown. SOL/USD is fetched only when a quote reports fee lamports.
- `npm run check`: formatting, strict TypeScript, **93 tests across 5 files** (plus 1 opt-in live smoke test) and production build passed. The live smoke test ran against mainnet at 1, 10,000 and 250,000 USDC.
- Browser: the production build ran in live mode and was checked at 1280px (light) and 390px (light and dark). There was no horizontal overflow, and the unavailable-wrapper, sub-cent-edge and 250k states rendered. Demo mode was re-checked after the shared-presenter refactor.

Still not done: Pyth fair-value reference (access pending), wallet execution, public hosting, per-IP abuse limits on a public deployment. Public `api.mainnet-beta.solana.com` may throttle hosted traffic; use a dedicated RPC endpoint for the deployed demo.

## Hosted deployment — September 24, 2026, ~14:00 UTC

- Vercel production deployment smoke-tested: health 200 with `liveReady: true`. Real comparisons at 1, 10,000 and 250,000 USDC were served during US market hours, when AAPLon won at 10k and AAPLx at 250k, so the winner changes with size and time. NVDA returned 422, invalid amounts and demo-only scenarios 400. No response body contained the RPC URL or API keys.
- The first burst test (3 comparisons in ~6 s) got a 429 on the third. That led to the server-side call budget and UI auto-retry described above.

## Seventeen verified markets — September 24, 2026, ~14:40 UTC

Admission followed the same gate as AAPL, using issuer-published addresses only:

1. **Issuer identity.** xStocks mints come from the issuer's public API ([api.xstocks.fi/api/v2/public/assets](https://api.xstocks.fi/api/v2/public/assets), Solana deployments, 1,124 assets across 12 pages). Ondo mints come from Ondo's published [mainnet constants](https://github.com/ondoprotocol/gm-solana-simulator/blob/main/constants.rs) (443 assets). 230 underlyings are offered by both. Both sources independently return the AAPL pair admitted earlier.
2. **Chain state.** One `getMultipleAccounts` read of all 34 mints. Every mint is Token-2022 with the expected symbol and decimals (xStocks 8, Ondo 9), the issuer's exact extension profile (identical to AAPL), not paused, and no transfer-hook program. NFLX carries a ×10 multiplier on both issuers after Netflix's 10-for-1 split, a live case where raw token counts would mislead by 10×.
3. **Economic cross-check.** Real 10,000 USDC Jupiter quotes put each pair's cost per share within 0–21 bps of each other (NFLXx needed one retry). A wrong share conversion would disagree by whole percentages or 10×.
4. **End-to-end.** The opt-in smoke test ran every ticker through `liveComparison` on mainnet (17/17 passed, 10,000 USDC, US market open):

```
AAPL: AAPLx 338.6217 (0.0 bps) | AAPLon 338.6221 (0.0 bps)
NVDA: NVDAx 223.8498 (0.0 bps) | NVDAon 223.9036 (2.4 bps)
TSLA: TSLAx 379.6164 (0.0 bps) | TSLAon 379.8554 (6.2 bps)
MSFT: MSFTx 495.7460 (0.0 bps) | MSFTon 496.1458 (8.0 bps)
GOOGL: GOOGLx 341.6955 (2.6 bps) | GOOGLon 341.6045 (0.0 bps)
AMZN: AMZNx 248.2391 (0.0 bps) | AMZNon 248.2498 (0.4 bps)
META: METAx 770.4891 (0.0 bps) | METAon 770.7277 (3.0 bps)
NFLX: NFLXx 71.8910 (5.1 bps) | NFLXon 71.8538 (0.0 bps)
AMD: AMDx 617.2260 (0.0 bps) | AMDon 617.6463 (6.8 bps)
COIN: COINx 199.5820 (0.0 bps) | COINon 199.7081 (6.3 bps)
HOOD: HOODx 122.0629 (0.0 bps) | HOODon 122.1935 (10.6 bps)
MSTR: MSTRx 162.5470 (0.0 bps) | MSTRon 162.8010 (15.6 bps)
PLTR: PLTRx 193.7938 (3.8 bps) | PLTRon 193.7201 (0.0 bps)
CRCL: CRCLx 93.2547 (0.0 bps) | CRCLon 93.3864 (14.1 bps)
SPY: SPYx 767.8878 (0.0 bps) | SPYon 768.3493 (6.0 bps)
QQQ: QQQx 740.2640 (0.0 bps) | QQQon 740.8186 (7.4 bps)
GLD: GLDx 392.4727 (1.8 bps) | GLDon 392.3993 (0.0 bps)
```

Admitted: AAPL, NVDA, TSLA, MSFT, GOOGL, AMZN, META, NFLX, AMD, COIN, HOOD, MSTR, PLTR, CRCL, SPY, QQQ, GLD. The remaining ~213 overlapping underlyings are not admitted until they pass the same checks.
