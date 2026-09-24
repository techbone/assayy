# Stocklana delivery plan

Official cutoff: **2026-09-25 20:00 UTC = 21:00 Africa/Lagos = 16:00 EDT**.
Internal target: submit by **18:00 Lagos**. Leave three hours for upload, registration or platform issues. Do not wait for the ideal video before creating a submission with a valid link. User handles account registration/submission unless explicitly delegating it.

All times below are Lagos time. Timeboxes are targets, not guarantees; trim optional scope when a gate slips.

| Milestone                   | Target              | Deliverable                                                                                         | Exit gate                                                                                                | Status                                                                                                                                                |
| --------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Foundation               | Thu Sep 24, morning | Runnable Next.js desk, exact math, comparison engine, guards, provider adapters, architecture       | Typecheck/tests/build; demo renders and rejects bad inputs                                               | Implemented; see validation record                                                                                                                    |
| M2 Verified live comparison | Thu by 16:00        | One issuer-verified AAPL pair, live Pyth/USDC references, mint extensions, bounded Jupiter sampling | Fresh responses on mainnet, independent exposure evidence, no fixture fallback, truthful off-hours state | Live read-only AAPL comparison shipped (issuer-documented multiplier conversion, fail-closed mint checks, real quotes). Pyth reference pending access |
| M3 First wallet execution   | Thu by 21:00        | Connect wallet, review one small purchase, simulate, sign, confirm, explorer receipt                | Guarded <=1 USDC mainnet fill (if supported), SOL reserve, wallet rejection and timeout recovery         | Done: capped wallet buy shipped; first mainnet buy 1 USDC → AAPLx, Sep 24 19:54 UTC (see validation)                                                  |
| M4 Split + hardening        | Fri by 12:00        | Requote second leg, partial-fill handling, second ticker if verified                                | No false savings claims or duplicate execution; closed/stale feed paths tested                           | Pending; split execution optional if gates slip                                                                                                       |
| M5 Release + record         | Fri 12:00–16:00     | Hosted app, README, clean repo, two-minute video, source disclosures                                | Live URL smoke test; real transaction evidence; mobile check; no secrets                                 | Pending                                                                                                                                               |
| M6 Submit                   | Fri 16:00–18:00     | Main-track + Pyth submission with live demo/repo/video                                              | User confirms submission accepted before 21:00 cutoff                                                    | Pending                                                                                                                                               |

## Scope cuts in order

1. Extra tickers beyond the first verified dual-wrapper market.
2. Cosmetic charts/history and advanced settings.
3. Automatic two-leg execution. Keep the split analysis as indicative and execute one wrapper safely.

Never cut verified mint identity, correct exposure normalization, price freshness, minimum received, review/signing, or accurate pending/partial/failure status. If issuer conversion evidence cannot be verified in time, show each wrapper against its own reference without ranking economic share cost; do not invent 1:1 equivalence. If a feed is only available through paid Pro, confirm trial/access and implement the Pro adapter or narrow supported assets. Do not promise free availability.

## Definition of hackathon-ready

- A clear problem and an app judges can use without setup to understand it.
- Live mode with at least one verified market, not a demo disguised as mainnet.
- One linked mainnet transaction, actual execution amounts and supported direction disclosed.
- Pyth materially affects the decision/guard, not just a decorative price.
- `npm run check` passes locally and on a clean clone; deployment smoke-tested on desktop and mobile.
- Limits stated: supported markets, off-hours behavior, fee estimates, quote expiry, issuer differences and partial fills.
- A credible post-hackathon plan: more assets, audited execution policy, stronger recovery/traffic controls. Alerts and resting orders are separate later infrastructure work.

## Validation record

Record completed checks and remaining gaps in `docs/VALIDATION.md`. Passing fixture/provider-contract tests does not establish live API compatibility, mainnet safety, liquidity at size or concurrent-user capacity.
