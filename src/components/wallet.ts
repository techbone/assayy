"use client";

import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";

export const MAINNET = "solana:mainnet";
const CONNECT = "standard:connect";
const DISCONNECT = "standard:disconnect";
const SIGN = "solana:signTransaction";

type ConnectFeature = {
  connect(input?: { silent?: boolean }): Promise<{
    accounts: readonly WalletAccount[];
  }>;
};
type DisconnectFeature = { disconnect(): Promise<void> };
type SignFeature = {
  signTransaction(
    ...inputs: {
      account: WalletAccount;
      transaction: Uint8Array;
      chain: string;
    }[]
  ): Promise<readonly { signedTransaction: Uint8Array }[]>;
};

/** Wallets that can connect and sign (not send) Solana mainnet transactions. */
export function solanaWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter(
      (wallet) =>
        wallet.chains.includes(MAINNET) &&
        CONNECT in wallet.features &&
        SIGN in wallet.features,
    );
}
export function onWalletsChanged(listener: () => void) {
  const wallets = getWallets();
  const off = [
    wallets.on("register", listener),
    wallets.on("unregister", listener),
  ];
  return () => off.forEach((stop) => stop());
}
export async function connect(wallet: Wallet): Promise<WalletAccount> {
  const { accounts } = await (
    wallet.features[CONNECT] as ConnectFeature
  ).connect();
  const account =
    accounts.find((a) => a.chains.includes(MAINNET)) ?? accounts[0];
  if (!account) throw new Error("The wallet did not share an account");
  return account;
}
export async function disconnect(wallet: Wallet) {
  const feature = wallet.features[DISCONNECT] as DisconnectFeature | undefined;
  await feature?.disconnect().catch(() => undefined);
}
/** Asks the wallet to sign only. Assay submits through Jupiter so RFQ makers can co-sign. */
export async function signTransaction(
  wallet: Wallet,
  account: WalletAccount,
  base64: string,
): Promise<string> {
  const transaction = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const [result] = await (wallet.features[SIGN] as SignFeature).signTransaction(
    { account, transaction, chain: MAINNET },
  );
  if (!result) throw new Error("The wallet returned no signature");
  let binary = "";
  for (const byte of result.signedTransaction)
    binary += String.fromCharCode(byte);
  return btoa(binary);
}
