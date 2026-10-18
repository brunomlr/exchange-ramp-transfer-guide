import type { AccountType } from "@/lib/tokens";

export type { AccountType };
export type Addressing = "muxed" | "memo";
export type SendStatus = "idle" | "sending" | "success" | "error";

/**
 * How the Ramp/Exchange identifies which user a deposit belongs to.
 * - exchange: one shared omnibus account + a per-user id (memo / muxed id).
 * - ramp:     an off-ramp intent that pins the user's wallet address + amount.
 */
export type TrackingModel = "exchange" | "ramp";

export interface SentInfo {
  hash: string;
  ledger: number;
  summary: string;
  /** The amount actually sent, in whole units. Absent on sends saved before it existed. */
  amount?: string;
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
 * `toMuxedId` is present only when the withdrawal carried a routing id — a
 * muxed (M…) destination or a classic `Memo.id`; otherwise the data is just
 * the amount and the funds went to a plain address.
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
  /** The 64-bit routing id carried on-chain, if any (muxed dest or memo). */
  toMuxedId?: string;
}

/** How a withdrawal optionally tags its destination with a routing id. */
export type WithdrawalIdMethod = "none" | "muxed" | "memo";

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
  /** Routing-id method actually used for this withdrawal. */
  idMethod: WithdrawalIdMethod;
  /** The 64-bit id sent (when idMethod !== "none"). */
  sentId?: string;
}
