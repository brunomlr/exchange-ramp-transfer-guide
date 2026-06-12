import * as StellarSdk from "@stellar/stellar-sdk";
import { fromStroops } from "@/lib/stellar";

/**
 * RPC-only deposit detection.
 *
 * Every asset movement on Stellar — a classic `payment` op, a SAC `transfer`,
 * or a custom SEP-41 contract `transfer` — emits a CAP-67 `transfer` event on
 * the token contract. The topic arity differs by token kind:
 *
 *   SAC / classic asset:  ["transfer", from:Address, to:Address, sep0011_asset:String]   (4 topics)
 *   custom SEP-41 token:  ["transfer", from:Address, to:Address]                         (3 topics)
 *
 *   data:   i128 amount              (no muxing)
 *        OR { amount: i128, to_muxed_id: u64|bytes|string }   (muxed dest OR memo)
 *
 * `to` is always the BASE (G/C) address; the multiplexing id lives in the data
 * map as `to_muxed_id`. For a classic G payment that used a MEMO instead of a
 * muxed address, the memo value is surfaced as the same `to_muxed_id`. The single
 * `to_muxed_id` check therefore works uniformly across all three token kinds —
 * the only difference is topic arity, which `fetchTransferEvents` filters for.
 *
 * The same event stream feeds two identification models (see `matchTransfer`):
 *   - exchange: match `to_muxed_id` against a per-user deposit id.
 *   - ramp:     match the off-ramp intent — `from` wallet + exact `amount`.
 */

export interface DetectedTransfer {
  eventId: string;
  ledger: number;
  txHash?: string;
  from: string;
  /** The credited base address (G or C). We only keep events to the exchange. */
  to: string;
  /** SEP-0011 asset string, e.g. "native" or "USDC:GA…". */
  asset: string;
  contractId: string;
  /** Raw amount in stroops. */
  amount: string;
  amountDisplay: string;
  /** Present only when the destination was muxed OR the classic tx carried a memo. */
  toMuxedId?: string;
  /** Human-readable topics for the "how it was detected" panel. */
  topicsRaw: string[];
  /** Pretty-printed event data for the technical panel. */
  dataRaw: string;
}

/** The active identification strategy, chosen at step 2. */
export type Matcher =
  | { model: "exchange"; depositId: string }
  | {
      model: "ramp";
      userWallet: string;
      amountStroops: string;
      /** Only count events at/after the ledger the intent was armed. */
      sinceLedger: number;
    };

/** Does this transfer satisfy the active matcher? */
export function matchTransfer(t: DetectedTransfer, m: Matcher): boolean {
  if (m.model === "exchange") {
    return t.toMuxedId != null && t.toMuxedId === m.depositId;
  }
  return (
    t.from === m.userWallet &&
    t.amount === m.amountStroops &&
    t.ledger >= m.sinceLedger
  );
}

const TRANSFER_TOPIC = StellarSdk.xdr.ScVal.scvSymbol("transfer").toXDR("base64");

function bigintToString(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * Decode one raw RPC event into a DetectedTransfer, or null if it isn't a
 * `transfer` event. No address filtering — callers decide whose movements they
 * care about (deposits filter on `to`, withdrawals filter on `from`).
 */
export function decodeTransferEvent(
  ev: StellarSdk.rpc.Api.EventResponse
): DetectedTransfer | null {
  let topics: unknown[];
  try {
    topics = ev.topic.map((t) => StellarSdk.scValToNative(t));
  } catch {
    return null;
  }
  if (String(topics[0]) !== "transfer") return null;

  const from = String(topics[1] ?? "");
  const to = String(topics[2] ?? "");
  const contractId = ev.contractId?.toString?.() ?? String(ev.contractId ?? "");
  // SACs carry the SEP-0011 asset string in topic[3]; custom tokens (3 topics)
  // don't, so fall back to the emitting contract id for display.
  const asset = topics[3] != null ? String(topics[3]) : contractId;

  const data = StellarSdk.scValToNative(ev.value) as
    | bigint
    | { amount: bigint; to_muxed_id?: bigint | string | Uint8Array };

  let amount: bigint;
  let toMuxedId: string | undefined;
  if (typeof data === "bigint") {
    amount = data;
  } else {
    amount = BigInt(data.amount);
    if (data.to_muxed_id != null) {
      toMuxedId =
        data.to_muxed_id instanceof Uint8Array
          ? Buffer.from(data.to_muxed_id).toString("hex")
          : data.to_muxed_id.toString();
    }
  }

  return {
    eventId: ev.id,
    ledger: ev.ledger,
    // txHash is present on recent RPC; guard for older shapes.
    txHash: (ev as { txHash?: string }).txHash,
    from,
    to,
    asset,
    contractId,
    amount: amount.toString(),
    amountDisplay: fromStroops(amount),
    toMuxedId,
    topicsRaw: topics.map((t) => String(t)),
    dataRaw: JSON.stringify(data, bigintToString, 2),
  };
}

/** Decode one raw RPC event, keeping only deposits credited to the exchange. */
export function parseTransferEvent(
  ev: StellarSdk.rpc.Api.EventResponse,
  opts: { exchangeBaseG: string }
): DetectedTransfer | null {
  const t = decodeTransferEvent(ev);
  if (!t) return null;
  // Only deposits credited to the Ramp/Exchange base account.
  if (t.to !== opts.exchangeBaseG) return null;
  return t;
}

export interface FetchEventsResult {
  transfers: DetectedTransfer[];
  latestLedger: number;
  /** Pass back into the next call to resume exactly where we stopped. */
  nextCursor?: string;
}

/**
 * One poll of the event stream. Provide `startLedger` for the first call, then
 * pass the returned `nextCursor` on every subsequent call to resume.
 */
export async function fetchTransferEvents(
  server: StellarSdk.rpc.Server,
  opts: {
    contractIds: string[];
    exchangeBaseG: string;
    startLedger?: number;
    cursor?: string;
  }
): Promise<FetchEventsResult> {
  // Two topic matchers (OR semantics): SACs emit a 4-topic transfer event
  // ["transfer", from, to, sep0011_asset]; standard custom SEP-41 tokens emit a
  // 3-topic event ["transfer", from, to] (the mux id lives in the data map). RPC
  // matches a topic filter only when its segment count equals the event's, so we
  // register both.
  const filters: StellarSdk.rpc.Api.EventFilter[] = [
    {
      type: "contract",
      contractIds: opts.contractIds,
      topics: [
        [TRANSFER_TOPIC, "*", "*", "*"],
        [TRANSFER_TOPIC, "*", "*"],
      ],
    },
  ];

  const request = opts.cursor
    ? { filters, cursor: opts.cursor, limit: 200 }
    : { filters, startLedger: opts.startLedger, limit: 200 };

  const res = await server.getEvents(
    request as StellarSdk.rpc.Server.GetEventsRequest
  );

  const transfers: DetectedTransfer[] = [];
  for (const ev of res.events) {
    const parsed = parseTransferEvent(ev, opts);
    if (parsed) transfers.push(parsed);
  }

  const lastPaging = res.events.length
    ? (res.events[res.events.length - 1] as { pagingToken?: string }).pagingToken
    : undefined;

  return {
    transfers,
    latestLedger: res.latestLedger,
    nextCursor: res.cursor ?? lastPaging ?? opts.cursor,
  };
}
