import "server-only";
import { EXTENSION } from "../domain/mint";

export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export type VerifiedWrapper = {
  id: string;
  label: string;
  issuer: string;
  mint: string;
  decimals: number;
  metadataSymbol: string;
  /** Exact extension set observed at admission. Any change fails closed until reviewed. */
  extensions: readonly number[];
  /** Issuer sources: mint identity, then shares = raw / 10^decimals x active multiplier. */
  evidence: readonly string[];
};
export type VerifiedAsset = {
  ticker: string;
  name: string;
  wrappers: readonly [VerifiedWrapper, VerifiedWrapper];
};

const ONDO_EXTENSIONS = [
  EXTENSION.confidentialTransferMint,
  EXTENSION.defaultAccountState,
  EXTENSION.transferHook,
  EXTENSION.metadataPointer,
  EXTENSION.tokenMetadata,
  EXTENSION.scaledUiAmount,
  EXTENSION.pausable,
];
const XSTOCKS_EXTENSIONS = [...ONDO_EXTENSIONS, EXTENSION.permanentDelegate];
const XSTOCKS_EVIDENCE = [
  "https://api.xstocks.fi/api/v2/public/assets",
  "https://docs.xstocks.fi/developers/multipliers",
];
const ONDO_EVIDENCE = [
  "https://github.com/ondoprotocol/gm-solana-simulator/blob/main/constants.rs",
  "https://docs.ondo.finance/ondo-global-markets/token-and-quote-pricing",
];

/** [ticker, name, xStocks mint, Ondo mint]. Admitted September 24, 2026: each mint matches its
 * issuer's published address, the on-chain symbol/decimals/extension profile, and cross-issuer
 * Jupiter quotes agreed within 25 bps per share. See docs/VALIDATION.md. No Pyth feed is admitted.
 */
const ADMITTED: readonly (readonly [string, string, string, string])[] = [
  [
    "AAPL",
    "Apple",
    "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo",
  ],
  [
    "NVDA",
    "NVIDIA",
    "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    "gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo",
  ],
  [
    "TSLA",
    "Tesla",
    "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    "KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo",
  ],
  [
    "MSFT",
    "Microsoft",
    "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    "FRmH6iRkMr33DLG6zVLR7EM4LojBFAuq6NtFzG6ondo",
  ],
  [
    "GOOGL",
    "Alphabet (Class A)",
    "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    "bbahNA5vT9WJeYft8tALrH1LXWffjwqVoUbqYa1ondo",
  ],
  [
    "AMZN",
    "Amazon",
    "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
    "14Tqdo8V1FhzKsE3W2pFsZCzYPQxxupXRcqw9jv6ondo",
  ],
  [
    "META",
    "Meta Platforms",
    "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
    "fDxs5y12E7x7jBwCKBXGqt71uJmCWsAQ3Srkte6ondo",
  ],
  [
    "NFLX",
    "Netflix",
    "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL",
    "g4KnPrxPLeeKkwvDmZFMtYQPM64eHeShbD55vK6ondo",
  ],
  [
    "AMD",
    "AMD",
    "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF",
    "14diAn5z8kjrKwSC8WLqvBqqe5YmihJhjxRxd8Z6ondo",
  ],
  [
    "COIN",
    "Coinbase",
    "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu",
    "5u6KDiNJXxX4rGMfYT4BApZQC5CuDNrG6MHkwp1ondo",
  ],
  [
    "HOOD",
    "Robinhood",
    "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg",
    "BVdXGvmgi6A9oAiwWvBvP76fyTqcCNRJMM7zMN6ondo",
  ],
  [
    "MSTR",
    "Strategy (MicroStrategy)",
    "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ",
    "FSz4ouiqXpHuGPcpacZfTzbMjScoj5FfzHkiyu2ondo",
  ],
  [
    "PLTR",
    "Palantir",
    "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4",
    "HfsnTS5qtdStwec9DfBrunRqnAMYMMz1kjv9Hu9ondo",
  ],
  [
    "CRCL",
    "Circle",
    "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1",
    "6xHEyem9hmkGtVq6XGCiQUGpPsHBaoYuYdFNZa5ondo",
  ],
  [
    "SPY",
    "S&P 500 ETF (SPY)",
    "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    "k18WJUULWheRkSpSquYGdNNmtuE2Vbw1hpuUi92ondo",
  ],
  [
    "QQQ",
    "Nasdaq-100 ETF (QQQ)",
    "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    "HrYNm6jTQ71LoFphjVKBTdAE4uja7WsmLG8VxB8ondo",
  ],
  [
    "GLD",
    "Gold ETF (GLD)",
    "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
    "hWfiw4mcxT8rnNFkk6fsCQSxoxgZ9yVhB6tyeVcondo",
  ],
];

export const verifiedAssets: readonly VerifiedAsset[] = ADMITTED.map(
  ([ticker, name, xMint, onMint]) => ({
    ticker,
    name,
    wrappers: [
      {
        id: "x",
        label: `${ticker}x`,
        issuer: "xStocks · Backed",
        mint: xMint,
        decimals: 8,
        metadataSymbol: `${ticker}x`,
        extensions: XSTOCKS_EXTENSIONS,
        evidence: XSTOCKS_EVIDENCE,
      },
      {
        id: "on",
        label: `${ticker}on`,
        issuer: "Ondo Global Markets",
        mint: onMint,
        decimals: 9,
        metadataSymbol: `${ticker}on`,
        extensions: ONDO_EXTENSIONS,
        evidence: ONDO_EVIDENCE,
      },
    ],
  }),
);
export const findAsset = (ticker: string) =>
  verifiedAssets.find((asset) => asset.ticker === ticker);
