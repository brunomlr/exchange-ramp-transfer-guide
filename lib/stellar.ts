import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Client-safe Stellar config + helpers. RPC only — no Horizon anywhere.
 * Only NEXT_PUBLIC_* values are referenced here so this module is safe to import
 * from client components. Secrets live in /api/send (server-only).
 */

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org";

export const networkPassphrase = StellarSdk.Networks.TESTNET;

/** Native XLM Stellar Asset Contract (testnet). */
export const XLM_SAC =
  process.env.NEXT_PUBLIC_XLM_SAC ||
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const EXCHANGE_G = process.env.NEXT_PUBLIC_EXCHANGE_G || "";
export const USER_G = process.env.NEXT_PUBLIC_USER_G || "";
export const USER_CONTRACT_C = process.env.NEXT_PUBLIC_USER_CONTRACT_C || "";
/** Verifier contract the smart account's ed25519 signer is registered against. */
export const ED25519_VERIFIER = process.env.NEXT_PUBLIC_ED25519_VERIFIER || "";
export const DEPOSIT_ID = process.env.NEXT_PUBLIC_DEPOSIT_ID || "1234566789";

/** A read-only RPC server instance (browser-safe). */
export function rpcServer() {
  return new StellarSdk.rpc.Server(RPC_URL);
}

/** Build the muxed (M...) address for an exchange base G account + deposit id. */
export function muxedAddress(baseG: string, id: string): string {
  return new StellarSdk.MuxedAccount(
    new StellarSdk.Account(baseG, "0"),
    id
  ).accountId();
}

/** Stroops (7-decimal) helpers. */
export function toStroops(amount: string, decimals = 7): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export function fromStroops(stroops: bigint | string | number, decimals = 7): string {
  const v = BigInt(stroops);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Shorten an address for display: GABC…WXYZ */
export function shorten(addr: string, head = 6, tail = 6): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export const explorerTxUrl = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const explorerAccountUrl = (addr: string) =>
  `https://stellar.expert/explorer/testnet/account/${addr}`;
export const explorerContractUrl = (id: string) =>
  `https://stellar.expert/explorer/testnet/contract/${id}`;
