# Assay · Solana

**The price behind the ticker.** Compare the cost of tokenized stock exposure across issuers, then trade only when the data and execution checks support it.

## Current milestone

**Live read-only comparison on Solana mainnet.** Set `ASSAY_MODE=live` to compare Apple exposure across two issuer-verified wrappers, **AAPLx** (xStocks) and **AAPLon** (Ondo):

- Real, size-specific Jupiter v2 quotes: the full order on each wrapper, plus a sampled 50/50 split.
- On each request, both mints are read on-chain. Tokens are converted to share equivalents using each mint's active Scaled UI multiplier, which both issuers document as the share ratio.
- Output: cost per share, spread against the cheapest wrapper, the best allocation, and how much more stock the winner buys.

Any drift in mint state (pause, new extension, symbol or decimals change), or a pending multiplier update, stops the comparison instead of guessing.

What is not live yet:

- **Pyth fair-value premium.** It shows as pending until feed access is verified.
- **Wallet execution.** No swap can be signed or submitted by this version.

Demo mode (the default) keeps the labeled synthetic AAPL/NVDA scenarios, including stale-oracle and closed-market guards.

## Run locally

Requires Node 22.13+ (Node 22 LTS recommended) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Demo mode needs no keys, RPC, wallet, database, worker, or paid services. Press **Compare wrappers**; try a large budget, a closed market, and a stale feed.

For live mode, set `ASSAY_MODE=live`, `JUPITER_API_KEY` and `SOLANA_RPC_URL` in `.env.local` and restart. Try 1, 10k and 250k USDC.

```sh
npm run check     # TypeScript, unit/contract tests, production build
npm run discover  # Read-only candidates; Jupiter key required, Pyth optional
LIVE_SMOKE=1 node --env-file=.env.local node_modules/.bin/vitest run tests/live.smoke.test.ts  # opt-in mainnet smoke
```

`GET /api/health` reports configuration presence without secrets. `GET /api/compare?ticker=AAPL&amount=10000&scenario=normal` returns the demo comparison. Live mode without a Jupiter key or RPC returns `LIVE_NOT_READY`; provider failures return 429/503 with a reason. Live mode never substitutes fixtures.

## Provider setup for milestone two

Put secrets in `.env.local`, never in chat, source control, or `NEXT_PUBLIC_*` variables:

- `JUPITER_API_KEY`: generate at https://developers.jup.ag/portal. The free tier currently has a 1 RPS limit.
- `PYTH_API_KEY`: obtain through https://terminal.pyth.network; confirm the key's access to the exact equity and wrapper feeds. A Pro subscription/trial is not assumed or purchased.
- `SOLANA_RPC_URL`: an HTTPS mainnet RPC endpoint from your provider. Keep this server-side; add only narrow read/simulation methods in milestone three.

Only assets in the reviewed registry can be compared live; today that is AAPL. Admission evidence and mainnet results are recorded in [validation](docs/VALIDATION.md). Add markets only through [asset verification](docs/ASSET_VERIFICATION.md). Discovery results can contain impostor tickers; they are not an allowlist.

**Free-tier budget:** the Jupiter free key allows about 10 requests per 10 seconds. One comparison uses 4 quotes plus 1 RPC read. Identical requests within 8 s share one fan-out, and at most 2 comparisons run at once. Excess load gets a 429 with `Retry-After`. For a public deployment, use a dedicated RPC endpoint; the public mainnet RPC may throttle.

## Project map

| Path                     | Responsibility                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `src/domain/`            | Exact amounts, Token-2022 mint decoding, normalization, allocation search, guards, session |
| `src/server/providers/`  | Validated, read-only Jupiter v2, Solana RPC mint reader, authenticated Pyth Hermes adapter |
| `src/server/registry.ts` | Issuer-verified AAPL wrappers: mints, decimals, extension profile, evidence                |
| `src/server/live.ts`     | Live orchestration: mint admission, quote sampling, fail-closed checks, request dedupe     |
| `src/fixtures/`          | Deliberately isolated synthetic market conditions                                          |
| `src/app/api/`           | Stateless comparison and readiness endpoints                                               |
| `src/components/`        | Responsive comparison desk                                                                 |
| `tests/`                 | Financial boundaries, failures, provider response contracts                                |
| `docs/`                  | Architecture, release gates, asset verification, demo plan                                 |

## What “solid at size” means here

Raw on-chain units use `bigint`; decimal prices and share conversions use integer fractions. No financial routing calculation uses JavaScript floating point. The optimizer compares sampled full allocations against full-size single-wrapper quotes, accounts for extra estimated network fees, and does not assume convex liquidity. The fair-value guard checks **minimum output**, fresh equity and USDC references, confidence width, normalization validity, and upcoming corporate actions.

Those properties do **not** prove that a $250k quote can fill. Quotes can change, liquidity can overlap, issuers have different rights/restrictions, and separate legs are not atomic. Real execution requires fresh orders, transaction validation/simulation, wallet consent, reconciliation and a strict small-value launch cap. See [architecture](docs/ARCHITECTURE.md).

## Cost boundary

No application database, queue, cron, indexer, custody service, or deployed program. Hosting and provider free tiers are subject to current quotas and terms; unlimited free traffic is not promised. SOL covers network fees and possible token-account rent, not the USDC trade input. Obtain current rent/fee estimates and preserve a SOL reserve before a mainnet test. $5 is a test budget, not a guaranteed number of swaps.

## Delivery

- [Milestones and deadline](docs/MILESTONES.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [Asset verification gate](docs/ASSET_VERIFICATION.md)
- [Demo and release runbook](docs/DEMO_RUNBOOK.md)
- [Official integration sources](docs/SOURCES.md)

This is a new Solana implementation in `assayy`, separate from the sibling BNB project. No BNB source was copied. Third-party packages are declared in `package.json` and locked in `package-lock.json`. Disclose all reused components and any later shared logic in the hackathon submission. An open-source license has not been selected yet.
