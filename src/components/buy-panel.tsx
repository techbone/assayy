"use client";

import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { useEffect, useRef, useState } from "react";
import type {
  BuyQuote,
  BuyResult,
  ComparisonWrapper,
} from "../domain/contracts";
import {
  connect,
  disconnect,
  onWalletsChanged,
  signTransaction,
  solanaWallets,
} from "./wallet";

type Phase =
  | { kind: "idle" }
  | { kind: "quoting" }
  | { kind: "review"; quote: BuyQuote }
  | { kind: "signing"; quote: BuyQuote }
  | { kind: "submitting"; quote: BuyQuote }
  | { kind: "done"; quote: BuyQuote; result: BuyResult }
  | { kind: "unknown"; message: string }
  | { kind: "error"; message: string };

const short = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;
const solscan = (signature: string) => `https://solscan.io/tx/${signature}`;

async function postJson<T>(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data: data as T & { error?: string; code?: string } };
}

/** Buy one verified wrapper with the user's own wallet. Every trade needs wallet approval. */
export function BuyPanel({
  ticker,
  wrappers,
  defaultAmount,
  maxUsdc,
  now,
}: {
  ticker: string;
  wrappers: ComparisonWrapper[];
  defaultAmount: string;
  maxUsdc: string;
  now: number;
}) {
  const quoted = wrappers.filter((w) => w.status === "quoted");
  const cheapest =
    quoted.find((w) => w.spreadBps === "0.0")?.id ?? quoted[0]?.id ?? "x";
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [wrapper, setWrapper] = useState(cheapest);
  const [amount, setAmount] = useState(
    Number(defaultAmount) <= Number(maxUsdc) ? defaultAmount : maxUsdc,
  );
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [walletError, setWalletError] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    const refresh = () => setWallets(solanaWallets());
    refresh();
    return onWalletsChanged(refresh);
  }, []);

  async function choose(next: Wallet) {
    setWalletError("");
    try {
      setAccount(await connect(next));
      setWallet(next);
    } catch {
      setWalletError(`${next.name} did not connect. Try again.`);
    }
  }
  async function leave() {
    if (wallet) await disconnect(wallet);
    setWallet(null);
    setAccount(null);
    setPhase({ kind: "idle" });
  }
  async function getQuote() {
    if (!account || busy.current) return;
    busy.current = true;
    setPhase({ kind: "quoting" });
    try {
      const { response, data } = await postJson<BuyQuote>("/api/buy/quote", {
        ticker,
        wrapper,
        amount,
        taker: account.address,
      });
      setPhase(
        response.ok
          ? { kind: "review", quote: data }
          : { kind: "error", message: data.error ?? "Could not get a quote" },
      );
    } catch {
      setPhase({ kind: "error", message: "Could not reach Assay. Try again." });
    } finally {
      busy.current = false;
    }
  }
  async function confirm(quote: BuyQuote) {
    if (!wallet || !account || busy.current) return;
    busy.current = true;
    setPhase({ kind: "signing", quote });
    let signed: string;
    try {
      signed = await signTransaction(wallet, account, quote.transaction);
    } catch {
      busy.current = false;
      setPhase({
        kind: "error",
        message: "You declined in your wallet. Nothing was sent.",
      });
      return;
    }
    // From here the signed transaction exists: never resubmit automatically.
    setPhase({ kind: "submitting", quote });
    try {
      const { response, data } = await postJson<BuyResult>("/api/buy/execute", {
        ticker,
        wrapper,
        requestId: quote.requestId,
        signedTransaction: signed,
      });
      if (response.ok) setPhase({ kind: "done", quote, result: data });
      else if (data.code === "OUTCOME_UNKNOWN" || response.status >= 500)
        setPhase({
          kind: "unknown",
          message:
            data.error ??
            "We could not confirm the result. Check your wallet before trying again.",
        });
      else
        setPhase({ kind: "error", message: data.error ?? "The buy failed." });
    } catch {
      setPhase({
        kind: "unknown",
        message:
          "The connection dropped after signing. Check your wallet or Solscan before trying again — do not resubmit.",
      });
    } finally {
      busy.current = false;
    }
  }

  const label = (id: string) => wrappers.find((w) => w.id === id)?.label ?? id;
  return (
    <section className="buy-panel" aria-live="polite">
      <div className="buy-head">
        <span className="section-label">03 / BUY THE CHEAPER TOKEN</span>
        {account && wallet && (
          <span className="wallet-chip">
            {wallet.name} · {short(account.address)}
            <button
              className="link-button"
              type="button"
              onClick={() => void leave()}
            >
              Disconnect
            </button>
          </span>
        )}
      </div>

      {!account ? (
        wallets.length ? (
          <div className="wallet-list">
            {wallets.map((w) => (
              <button key={w.name} type="button" onClick={() => void choose(w)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" width={18} height={18} />
                Connect {w.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="buy-note">
            No Solana wallet found. Install Phantom or Jupiter Wallet to buy
            directly from Assay.
          </p>
        )
      ) : phase.kind === "idle" ||
        phase.kind === "error" ||
        phase.kind === "quoting" ? (
        <div className="buy-form">
          <div className="buy-choice" role="radiogroup" aria-label="Token">
            {quoted.map((w) => (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={wrapper === w.id}
                className={wrapper === w.id ? "selected" : ""}
                onClick={() => setWrapper(w.id)}
              >
                {w.label}
                {w.id === cheapest && <small>cheaper</small>}
              </button>
            ))}
          </div>
          <div className="amount-field buy-amount">
            <input
              aria-label="Buy amount in USDC"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={12}
            />
            <span>USDC</span>
          </div>
          <button
            className="primary"
            type="button"
            disabled={phase.kind === "quoting" || !quoted.length}
            onClick={() => void getQuote()}
          >
            {phase.kind === "quoting" ? "Getting quote…" : "Review buy"}
            <span aria-hidden="true">→</span>
          </button>
          {phase.kind === "error" && (
            <div className="error" role="alert">
              {phase.message}
            </div>
          )}
          <p className="buy-note">
            Up to {maxUsdc} USDC per order during launch. You see the minimum
            you&apos;ll receive before anything is signed, and your wallet asks
            you to approve.
          </p>
        </div>
      ) : phase.kind === "review" ||
        phase.kind === "signing" ||
        phase.kind === "submitting" ? (
        <div className="buy-review">
          <dl>
            <div>
              <dt>You pay</dt>
              <dd>
                {phase.quote.amount.replace(/0+$/, "").replace(/\.$/, "")} USDC
              </dd>
            </div>
            <div>
              <dt>You get</dt>
              <dd>
                ≈ {phase.quote.shares} {ticker} shares
                <small>
                  {phase.quote.tokens} {phase.quote.label}
                </small>
              </dd>
            </div>
            <div>
              <dt>Guaranteed at least</dt>
              <dd>
                {phase.quote.minimumShares} shares
                <small>or the trade fails and nothing is bought</small>
              </dd>
            </div>
            <div>
              <dt>Network cost</dt>
              <dd>
                {phase.quote.gasless
                  ? "Paid by Jupiter (gasless)"
                  : `${phase.quote.networkFeeSol} SOL`}
                {phase.quote.accountDepositSol !== "0.000000" && (
                  <small>
                    + {phase.quote.accountDepositSol} SOL one-time token account
                    deposit
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>{phase.quote.router}</dd>
            </div>
          </dl>
          {phase.kind === "review" ? (
            now >= phase.quote.expiresAt ? (
              <div className="buy-actions">
                <p className="buy-note">Quote expired.</p>
                <button
                  className="primary"
                  type="button"
                  onClick={() => void getQuote()}
                >
                  Get a fresh quote <span aria-hidden="true">↻</span>
                </button>
              </div>
            ) : (
              <div className="buy-actions">
                <button
                  className="primary"
                  type="button"
                  onClick={() => void confirm(phase.quote)}
                >
                  Confirm in {wallet?.name} ·{" "}
                  {Math.max(0, phase.quote.expiresAt - now)}s
                  <span aria-hidden="true">↗</span>
                </button>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
                >
                  Cancel
                </button>
              </div>
            )
          ) : (
            <p className="buy-status">
              {phase.kind === "signing"
                ? `Approve the transaction in ${wallet?.name}…`
                : "Sending to Solana — keep this page open…"}
            </p>
          )}
        </div>
      ) : phase.kind === "done" ? (
        <div
          className={`buy-result ${phase.result.status === "confirmed" ? "success" : "error"}`}
          role="status"
        >
          <strong>
            {phase.result.status === "confirmed"
              ? phase.result.receivedShares
                ? `Bought ${phase.result.receivedShares} ${ticker} shares as ${label(wrapper)}`
                : phase.result.message
              : "Nothing was bought"}
          </strong>
          {phase.result.status === "confirmed" && phase.result.paid && (
            <span>Paid {phase.result.paid} USDC</span>
          )}
          {phase.result.status === "failed" && (
            <span>{phase.result.message}</span>
          )}
          {phase.result.signature && (
            <a
              href={solscan(phase.result.signature)}
              target="_blank"
              rel="noreferrer"
            >
              View transaction on Solscan ↗
            </a>
          )}
          <button
            className="link-button"
            type="button"
            onClick={() => setPhase({ kind: "idle" })}
          >
            {phase.result.status === "confirmed" ? "Buy again" : "Try again"}
          </button>
        </div>
      ) : (
        <div className="buy-result warning" role="alert">
          <strong>Result unknown</strong>
          <span>{phase.message}</span>
          <button
            className="link-button"
            type="button"
            onClick={() => setPhase({ kind: "idle" })}
          >
            I&apos;ve checked my wallet
          </button>
        </div>
      )}
      {walletError && (
        <div className="error" role="alert">
          {walletError}
        </div>
      )}
    </section>
  );
}
