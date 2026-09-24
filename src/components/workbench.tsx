"use client";

import { useEffect, useRef, useState } from "react";
import type { Comparison, ComparisonRequest } from "../domain/contracts";

function display(value: string) {
  const [whole = "0", fraction] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
}
export function Workbench({
  mode,
  stocks,
}: {
  mode: "demo" | "live" | "unavailable";
  stocks: { ticker: string; name: string }[];
}) {
  const [ticker, setTicker] = useState<ComparisonRequest["ticker"]>("AAPL");
  const [amount, setAmount] = useState("10000");
  const [scenario, setScenario] =
    useState<ComparisonRequest["scenario"]>("normal");
  const [result, setResult] = useState<Comparison | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    setTheme(
      document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    );
    setNow(Math.floor(Date.now() / 1000));
    const interval = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => {
      clearInterval(interval);
      request.current?.abort();
    };
  }, []);
  function toggleTheme() {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("assay-theme", next);
    } catch {
      // The toggle still works when storage is unavailable.
    }
  }
  function invalidate() {
    generation.current++;
    request.current?.abort();
    setResult(null);
    setError("");
    setNotice("");
    setPending(false);
  }
  async function compare() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = ++generation.current;
    setPending(true);
    setError("");
    setResult(null);
    try {
      for (let attempt = 0; ; attempt++) {
        const response = await fetch(
          `/api/compare?${new URLSearchParams({ ticker, amount, scenario })}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        // Free-tier quote limits clear within seconds: wait and retry rather than fail.
        if (response.status === 429 && attempt < 2) {
          const seconds = Math.min(
            10,
            Math.max(1, Number(response.headers.get("retry-after")) || 5),
          );
          setNotice(
            `Quote sources are busy — retrying in ${seconds}s. Nothing is lost.`,
          );
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, seconds * 1000);
            controller.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          });
          setNotice("");
          continue;
        }
        if (!response.ok)
          throw new Error(data.error ?? "Unable to compare routes");
        if (id === generation.current) {
          setResult(data as Comparison);
          setNow(Math.floor(Date.now() / 1000));
        }
        break;
      }
    } catch (cause) {
      if (id === generation.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Comparison failed");
    } finally {
      if (id === generation.current) {
        setPending(false);
        setNotice("");
      }
    }
  }
  const expired = result ? now >= result.expiresAt : false;
  const live = mode === "live";
  const hasReference = Boolean(result?.reference);
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Assay home">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              d="M5 26 16 5l11 21M10 18h12M4 26h24"
              stroke="currentColor"
              strokeWidth="2.4"
            />
          </svg>
          assay<span className="brand-period">.</span>
        </a>
        <nav aria-label="Main navigation">
          <a className="active" href="#compare">
            Compare
          </a>
          <a href="#method">Method</a>
        </nav>
        <div className="top-actions">
          <span className="network">
            <span className="dot" />
            Built for Solana
          </span>
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            aria-pressed={theme === "dark"}
            title="Toggle color theme"
          >
            <svg
              className="moon-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M19.6 15.5A8.2 8.2 0 0 1 8.5 4.4 8.3 8.3 0 1 0 19.6 15.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <svg
              className="sun-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="3.6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 2v2.2M12 19.8V22M22 12h-2.2M4.2 12H2m17.1-7.1-1.6 1.6M6.5 17.5l-1.6 1.6m14.2 0-1.6-1.6M6.5 6.5 4.9 4.9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="theme-toggle-label">Theme</span>
          </button>
        </div>
      </header>
      <main>
        <div className="eyebrow">
          <span className="rule" /> TOKENIZED EQUITIES, EXAMINED
        </div>
        <section className="intro">
          <div>
            <h1>
              Same stock.
              <br />
              <span>A different price.</span>
            </h1>
            <p>
              One ticker. Multiple wrappers. See what your money
              <br className="desktop-break" /> actually buys before you make a
              move.
            </p>
          </div>
          <div className="edition">
            <span>ASSAY / SOLANA</span>
            <strong>01</strong>
            <span>THE COMPARISON DESK</span>
          </div>
        </section>
        <div className={`mode-banner ${live ? "live" : ""}`}>
          <span className="mode-badge">
            {live && <span className="live-dot" aria-hidden="true" />}
            {mode === "demo"
              ? "DEMO LAB"
              : live
                ? "LIVE · MAINNET"
                : "SETUP REQUIRED"}
          </span>
          <span>
            {mode === "demo"
              ? "Synthetic prices. Real comparison logic. No funds move in this preview."
              : live
                ? `Real Jupiter quotes for ${stocks.length} stocks and ETFs, each issued as two tokens (xStocks and Ondo). Read-only — nothing is signed or sent.`
                : "Live integrations are being verified. Trading is unavailable."}
          </span>
        </div>
        <section className="desk" id="compare" aria-label="Stock comparison">
          <form
            className="order-card"
            onSubmit={(event) => {
              event.preventDefault();
              void compare();
            }}
          >
            <div className="section-label">01 / YOUR ORDER</div>
            <h2>Find your exposure.</h2>
            <label htmlFor="ticker">Underlying stock</label>
            <select
              id="ticker"
              value={ticker}
              onChange={(event) => {
                invalidate();
                setTicker(event.target.value);
              }}
            >
              {stocks.map((stock) => (
                <option key={stock.ticker} value={stock.ticker}>
                  {stock.ticker} — {stock.name}
                </option>
              ))}
            </select>
            <label htmlFor="amount">Spend amount</label>
            <div className="amount-field">
              <input
                id="amount"
                value={amount}
                onChange={(event) => {
                  invalidate();
                  setAmount(event.target.value);
                }}
                inputMode="decimal"
                autoComplete="off"
                maxLength={24}
                aria-describedby="amount-help"
              />
              <span>USDC</span>
            </div>
            <div className="presets">
              {["100", "10000", "250000"].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    invalidate();
                    setAmount(value);
                  }}
                  className={amount === value ? "selected" : ""}
                >
                  {value === "250000"
                    ? "250k"
                    : value === "10000"
                      ? "10k"
                      : "100"}
                </button>
              ))}
            </div>
            <p className="field-help" id="amount-help">
              Compare 1–250,000 USDC. Estimates do not guarantee available
              liquidity.
            </p>
            {mode === "demo" && (
              <>
                <label htmlFor="scenario">Test a market condition</label>
                <select
                  id="scenario"
                  value={scenario}
                  onChange={(event) => {
                    invalidate();
                    setScenario(
                      event.target.value as ComparisonRequest["scenario"],
                    );
                  }}
                >
                  <option value="normal">Market open</option>
                  <option value="closed">Market closed</option>
                  <option value="stale">Stale reference price</option>
                  <option value="wide-confidence">
                    Wide oracle confidence
                  </option>
                </select>
              </>
            )}
            <button
              className="primary"
              type="submit"
              disabled={pending || mode === "unavailable" || now === 0}
            >
              {pending
                ? notice
                  ? "Waiting for quotes…"
                  : "Examining routes…"
                : result
                  ? "Refresh comparison"
                  : "Compare wrappers"}
              <span aria-hidden="true">↗</span>
            </button>
            <div className="order-footnote">
              <span>◎</span>{" "}
              {live
                ? "Quotes refresh on demand. Wallet execution comes next."
                : "Wallet connection comes after live validation."}
            </div>
          </form>
          <div className="results-card" aria-live="polite" aria-busy={pending}>
            <div className="results-top">
              <div className="section-label">02 / THE REAL COMPARISON</div>
              <span className={`status-pill ${expired ? "expired" : ""}`}>
                {result
                  ? expired
                    ? "Refresh needed"
                    : `${Math.max(0, result.expiresAt - now)}s to refresh`
                  : "Awaiting an order"}
              </span>
            </div>
            {notice && (
              <div className="notice" role="status">
                {notice}
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {!result && !error && (
              <div className="empty-state">
                <div className="stock-motif" aria-hidden="true">
                  <span>
                    {ticker}
                    <small>x</small>
                  </span>
                  <span className="motif-equals">≠</span>
                  <span>
                    {ticker}
                    <small>on</small>
                  </span>
                </div>
                <h2>Look beyond the token price.</h2>
                <p>
                  Compare equal stock exposure, check the premium,
                  <br />
                  and see whether splitting your order helps.
                </p>
                <div className="empty-tags">
                  <span>
                    {live ? "On-chain multipliers" : "Share normalization"}
                  </span>
                  <span>{live ? "Live Jupiter quotes" : "Oracle guard"}</span>
                  <span>Size-aware quotes</span>
                </div>
              </div>
            )}
            {result && (
              <>
                {result.reference ? (
                  <div className="reference">
                    <div>
                      <span className="muted">
                        Synthetic {result.ticker} reference
                      </span>
                      <strong>
                        ${result.reference.price}
                        <small>/ share</small>
                      </strong>
                    </div>
                    <div className="reference-meta">
                      <span>
                        {result.session === "open"
                          ? "Market-open scenario"
                          : "Market-closed scenario"}
                      </span>
                      <span>
                        Reference age:{" "}
                        {Math.max(0, now - result.reference.publishedAt)}s
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="reference pending-reference">
                    <div>
                      <span className="muted">
                        Best full-order cost per {result.ticker} share
                      </span>
                      <strong>
                        $
                        {display(
                          result.wrappers
                            .flatMap((w) =>
                              w.pricePerShare ? [w.pricePerShare] : [],
                            )
                            .sort((a, b) => Number(a) - Number(b))[0] ?? "—",
                        )}
                        <small>USDC</small>
                      </strong>
                    </div>
                    <div className="reference-meta">
                      <span>
                        US market{" "}
                        {result.session === "open"
                          ? "open"
                          : result.session === "closed"
                            ? "closed"
                            : "session unknown"}
                      </span>
                      <span>Pyth fair-value check: not connected</span>
                      {result.source.slot !== null && (
                        <span>Slot {result.source.slot.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )}
                {live && (
                  <p className="calculation-note explainer">
                    Same {result.ticker}, two tokens. Each is converted into
                    real {result.ticker} shares using its on-chain multiplier —
                    the cheaper one simply buys you more stock.
                  </p>
                )}
                <div className="wrapper-table">
                  <div className="table-head">
                    <span>FULL ORDER VIA</span>
                    <span>USD / SHARE</span>
                    <span>{hasReference ? "PREMIUM" : "VS BEST"}</span>
                  </div>
                  {result.wrappers.map((wrapper) => (
                    <div className="wrapper-row" key={wrapper.id}>
                      <div>
                        <strong>
                          {wrapper.mint ? (
                            <a
                              href={`https://solscan.io/token/${wrapper.mint}`}
                              target="_blank"
                              rel="noreferrer"
                              title="View mint on Solscan"
                            >
                              {wrapper.label}
                            </a>
                          ) : (
                            wrapper.label
                          )}
                        </strong>
                        <small>
                          {wrapper.issuer}
                          {wrapper.router ? ` · ${wrapper.router}` : ""}
                        </small>
                        {live && wrapper.multiplier && (
                          <small>×{wrapper.multiplier} share multiplier</small>
                        )}
                      </div>
                      {wrapper.status === "quoted" ? (
                        <>
                          <span>${display(wrapper.pricePerShare ?? "")}</span>
                          <span
                            className={
                              (wrapper.premiumBps ?? wrapper.spreadBps) ===
                              "0.0"
                                ? "premium best"
                                : "premium"
                            }
                          >
                            {hasReference ? (
                              <>
                                +{wrapper.premiumBps} <small>bps</small>
                              </>
                            ) : wrapper.spreadBps === "0.0" ? (
                              "Best"
                            ) : (
                              <>
                                +{wrapper.spreadBps} <small>bps</small>
                              </>
                            )}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="unavailable">No quote</span>
                          <span className="unavailable">at this size</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="route-summary">
                  <div>
                    <span className="section-label">
                      BEST SAMPLED ALLOCATION
                    </span>
                    <h3>
                      {result.plan.legs.length === 1
                        ? live
                          ? `${result.plan.legs[0]!.label} wins at this size.`
                          : "One wrapper wins."
                        : "A little of both goes further."}
                    </h3>
                  </div>
                  {live ? (
                    <div className="improvement">
                      <strong>
                        {!result.plan.edge
                          ? "—"
                          : result.plan.edge.usd === "0.00"
                            ? "<$0.01"
                            : `+$${display(result.plan.edge.usd)}`}
                      </strong>
                      <span>
                        {result.plan.edge
                          ? `+${result.plan.edge.shares} shares vs ${result.plan.edge.versus}`
                          : "only one wrapper quoted"}
                      </span>
                    </div>
                  ) : (
                    <div className="improvement">
                      <strong>${display(result.plan.improvementUsd)}</strong>
                      <span>estimated extra exposure value</span>
                    </div>
                  )}
                </div>
                <div
                  className="allocation-bar"
                  aria-label={result.wrappers
                    .map((w) => `${w.label} ${w.allocation}%`)
                    .join(", ")}
                >
                  {result.wrappers
                    .filter((w) => w.allocation !== "0")
                    .map((w) => (
                      <div
                        key={w.id}
                        className={`allocation-${w.id}`}
                        style={{ width: `${w.allocation}%` }}
                      >
                        {w.allocation}%
                      </div>
                    ))}
                </div>
                <div className="leg-list">
                  {result.plan.legs.map((leg) => (
                    <div key={leg.label}>
                      <span>
                        <i
                          className={
                            leg.label.endsWith("on") ? "key-on" : "key-x"
                          }
                        />
                        {leg.label}
                      </span>
                      <strong>
                        {display(leg.amount.replace(/\.0+$/, ""))} USDC
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="metrics">
                  <div>
                    <span>Share equivalents</span>
                    <strong>{display(result.plan.shares)}</strong>
                  </div>
                  <div>
                    <span>Best single wrapper</span>
                    <strong>{display(result.plan.baselineShares)}</strong>
                  </div>
                  <div>
                    <span>Est. network fees</span>
                    <strong>${result.plan.feeUsd}</strong>
                  </div>
                </div>
                <p className="calculation-note">
                  {live ? (
                    <>
                      Compared {result.plan.candidates} allocations from{" "}
                      {result.source.quotes} live Jupiter quotes. Share
                      equivalents = tokens received × each mint&apos;s on-chain
                      multiplier (issuer-documented: one scaled unit is one
                      share). Cost per share = USDC spent ÷ share equivalents
                      quoted. The edge values extra shares at the best observed
                      price. Quotes are indicative, not guaranteed fills.
                    </>
                  ) : (
                    <>
                      Compared {result.plan.candidates} sampled allocations.
                      Improvement values extra share exposure at the reference
                      price, less incremental network fees. It is not cash saved
                      or a guaranteed fill.
                    </>
                  )}
                </p>
                <div className="guard">
                  <span className="guard-icon">⌑</span>
                  <div>
                    <strong>
                      {live ? "Read-only mode" : "Execution locked"}
                    </strong>
                    {result.execution.reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                    {expired && (
                      <p>Quote expired — refresh before reviewing again.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
        <section className="method" id="method">
          <div className="method-title">
            <span className="section-label">THE ASSAY METHOD</span>
            <h2>
              Every number
              <br />
              has a reason.
            </h2>
          </div>
          <article>
            <span className="method-index">01</span>
            <h3>Measure the same thing.</h3>
            <p>
              Token counts can hide dividend and split adjustments. Compare
              verified share equivalents.
            </p>
          </article>
          <article>
            <span className="method-index">02</span>
            <h3>Price your actual size.</h3>
            <p>
              Compare complete allocations at your order size, including an
              unsplit baseline and fee estimates.
            </p>
          </article>
          <article>
            <span className="method-index">03</span>
            <h3>Know when to stop.</h3>
            <p>
              Stale references, uncertain exposure, or excessive premiums block
              the trading path.
            </p>
          </article>
        </section>
        <footer>
          <span>
            assay.{" "}
            <span className="footer-tag">The price behind the ticker.</span>
          </span>
          <span>
            {live ? "Live read-only" : "Foundation preview"} · Stocklana 2026
          </span>
        </footer>
      </main>
    </>
  );
}
