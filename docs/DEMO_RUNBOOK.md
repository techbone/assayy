# Demo and release runbook

## Two-minute story (what is live today)

0:00–0:15 — "The same Apple stock trades as different tokens on Solana. Which one actually buys you more Apple?" Open Assay; point at the LIVE · MAINNET banner.

0:15–0:50 — Compare 10,000 USDC. AAPLx and AAPLon token counts are not comparable, because each mint carries its own dividend multiplier. Assay reads both multipliers on-chain and shows cost per real share, the spread and which wrapper wins. Click a wrapper to show the mint on Solscan.

0:50–1:20 — Switch stocks: NFLX (both tokens carry a ×10 split multiplier — raw token counts would be 10× off) and SPY or NVDA. Switch to 250k, then to 1 USDC. Show how the gap and route change with size (RFQ vs aggregator, or no quote at all), and that the 50/50 split is tested but not claimed when it loses.

1:20–1:45 — Show the fail-closed design: read-only mode, the pending Pyth reference, the US-session label. In demo mode, show a stale oracle blocking a trade, labeled as a test scenario.

1:45–2:00 — Roadmap: Pyth fair-value guard once feed access is verified, wallet execution with minimum-received checks, more verified tickers.

Do not show or narrate wallet execution or a Pyth premium until they are live.

## Target story once execution and Pyth are live

0:00–0:15 — “The same stock trades through different tokens on Solana. A lower token price doesn't always mean cheaper exposure.” Show Assay and one verified pair.

0:15–0:45 — Enter an amount. Explain the independent Pyth reference, normalized share output, premium and each issuer. Show actual quote timestamps. State supported conversion evidence.

0:45–1:10 — Increase size. Show how the sampled allocation changes, including a case where staying in one wrapper wins. Explain estimates, network costs and re-quoting. Do not present synthetic numbers as real market savings.

1:10–1:35 — Small mainnet trade. Show review, wallet confirmation, received amount and explorer receipt. If a live signing interaction would expose private information, use a recording of the verified transaction. Label recordings/replays.

1:35–1:50 — Show a stale or closed-market reference blocking execution. Synthetic fault injection must be labeled as a test scenario, even in a video.

1:50–2:00 — Main track + Pyth; one-sentence roadmap. “More verified markets, deeper execution testing, then optional alerts.”

## Before spending from the ~$5 budget

- Check actual SOL and USDC balances and current SOL/USD. SOL is gas; USDC is principal.
- Estimate ATA rent and priority fees for the actual transaction, preserving a SOL reserve. Do not promise a fixed number of trades on a USD-denominated SOL balance.
- Quote the smallest supported route before spending. If 1 USDC fails due to route minimums, record that and reassess the budget; never silently increase it.
- Test one direction first, then quote a sell-back path. Rent is recoverable only if the relevant account can actually be emptied/closed; dust/frozen accounts/extensions can prevent this. Do not include hypothetical recovered rent in spendable funds.
- Record signature, exact raw input/output, fee, timestamp and execution state. Never record seeds/private keys.

## Release checklist

- `npm ci` and `npm run check` pass.
- Provider secrets exist only in host environment; key quotas and abuse controls configured.
- Issuer admission gate complete. Mainnet execution gate complete.
- Live mode cannot fall back to demo. Demo mode is visibly labeled and cannot sign.
- Stale/closed/unknown reference blocks buying. Oracle outage, RPC failure, 429 and no-route have useful states.
- Signature/request-ID reconciliation works after reload and uncertain submission; no automatic new transaction.
- Quote-input edits invalidate old results. Wrong network, rejection, insufficient funds, expired quote and partial completion tested.
- Desktop and narrow mobile layouts work; keyboard focus and status announcements visible.
- Hosting deployment smoke-tested. Nothing has been deployed yet. Set `ASSAY_MODE=live`, `JUPITER_API_KEY` and a dedicated `SOLANA_RPC_URL` as host secrets.
- Public source license chosen, required package notices preserved, reused work disclosed.
- README, live URL, video and submission description agree on what is implemented.
- Register and submit before the official cutoff; aim for 18:00 Lagos on Sep 25.

## One-sentence submission pitch

Today: Assay compares what your USDC actually buys in real shares across Solana's tokenized-stock issuers, using live Jupiter quotes and each issuer's on-chain multiplier, and stops when chain state can't be trusted.

Once Pyth access is verified: … and uses Pyth data to reject trades whose minimum received amount implies an excessive premium.

Only add a split-execution claim when that path is actually live and tested.
