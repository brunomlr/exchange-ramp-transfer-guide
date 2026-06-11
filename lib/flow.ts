import type { AccountType } from "@/lib/tokens";

export type { AccountType };
export type Addressing = "muxed" | "memo";
export type SendStatus = "idle" | "sending" | "success" | "error";

/**
 * How the Ramp/Exchange identifies which user a deposit belongs to.
 * - exchange: one shared omnibus account + a per-user id (memo / muxed id).
 * - ramp:     a deposit intent that pins the user's wallet address + amount.
 */
export type TrackingModel = "exchange" | "ramp";

export interface SentInfo {
  hash: string;
  ledger: number;
  summary: string;
  destination: string;
  memoId?: string;
  /** The deposit id actually carried on-chain (memo / muxed id). */
  depositId?: string;
  addressing: Addressing;
  tokenSymbol: string;
  mechanism: string;
  model: TrackingModel;
}

/**
 * The CAP-67 transfer event a withdrawal emits, as surfaced to the UI.
 * Withdrawals send to a plain address (no muxing/memo), so there is no
 * `to_muxed_id` — the data is just the amount.
 */
export interface EmittedEvent {
  from: string;
  to: string;
  /** SEP-0011 asset string, e.g. "native" or "USDC:GA…". */
  asset: string;
  amountDisplay: string;
  topicsRaw: string[];
  dataRaw: string;
  txHash?: string;
}

export interface WithdrawalSentInfo {
  hash: string;
  ledger: number;
  summary: string;
  /** The exchange's hot G account the funds left from. */
  source: string;
  /** The user address the funds were sent to (G or C). */
  destination: string;
  /** Which kind of address the funds were sent to. */
  destType: AccountType;
  tokenSymbol: string;
  /** "classic-native" | "contract-transfer". */
  mechanism: string;
  /** The on-chain transfer event, if it was indexed before we returned. */
  event: EmittedEvent | null;
  /** True when we read the real event back from RPC (vs. timed out). */
  confirmedOnChain: boolean;
}

export const STEPS = [
  "Choose source",
  "Choose model",
  "Configure deposit",
  "Send",
  "Detect",
] as const;

/** Which panel the app user should be interacting with at a given step. */
export type Side = "left" | "right";
export function activeSide(step: number): Side {
  return step === 2 || step === 5 ? "right" : "left";
}
