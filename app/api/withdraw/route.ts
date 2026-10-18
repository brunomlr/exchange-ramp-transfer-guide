import { NextRequest, NextResponse } from "next/server";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  RPC_URL,
  networkPassphrase,
  EXCHANGE_G,
  USER_G,
  USER_CONTRACT_C,
  isValidU64,
  muxedAddress,
  toStroops,
} from "@/lib/stellar";
import { findWithdrawalToken, type AccountType } from "@/lib/tokens";
import { decodeTransferEvent } from "@/lib/events";
import { BadRequest, checkAmount, submitAndPoll, withSourceLock } from "@/lib/submit";
import type { EmittedEvent, WithdrawalIdMethod } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WithdrawRequest {
  /** Where the funds are sent: a user G address or a user C (contract) address. */
  destType: AccountType;
  tokenKey: string;
  amount: string;
  /**
   * Optional routing id attached to the destination so a custodial recipient
   * (e.g. another exchange) can credit the right user:
   * - "muxed": fold a 64-bit id into the destination address (M…). Accounts only.
   * - "memo":  carry a `Memo.id` on a classic payment (surfaces as to_muxed_id).
   * - "none":  plain address, no id.
   */
  idMethod?: WithdrawalIdMethod;
  /** The 64-bit id value, as a decimal string, when idMethod !== "none". */
  idValue?: string;
}

const TRANSFER_TOPIC =
  StellarSdk.xdr.ScVal.scvSymbol("transfer").toXDR("base64");

/**
 * Read back the CAP-67 transfer event this withdrawal emitted. The tx is already
 * confirmed, but the event index can lag a moment, so retry a few times. Returns
 * null if it hasn't been indexed yet (the client falls back to the explorer).
 */
async function fetchEmittedEvent(
  server: StellarSdk.rpc.Server,
  opts: { contractId: string; from: string; startLedger: number; txHash: string }
): Promise<EmittedEvent | null> {
  // SACs emit a 4-topic transfer event ["transfer", from, to, sep0011_asset];
  // custom SEP-41 tokens emit a 3-topic one ["transfer", from, to]. RPC matches
  // a topic filter only when its segment count equals the event's — register both.
  const filters: StellarSdk.rpc.Api.EventFilter[] = [
    {
      type: "contract",
      contractIds: [opts.contractId],
      topics: [
        [TRANSFER_TOPIC, "*", "*", "*"],
        [TRANSFER_TOPIC, "*", "*"],
      ],
    },
  ];

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await server.getEvents({
        filters,
        startLedger: opts.startLedger,
        limit: 200,
      } as StellarSdk.rpc.Server.GetEventsRequest);

      for (const ev of res.events) {
        const t = decodeTransferEvent(ev);
        if (!t || t.from !== opts.from) continue;
        // Prefer the exact tx when the RPC surfaces a txHash; otherwise the
        // from + contract + ledger filter is specific enough for the demo.
        if (t.txHash && t.txHash !== opts.txHash) continue;
        return {
          from: t.from,
          to: t.to,
          asset: t.asset,
          amountDisplay: t.amountDisplay,
          topicsRaw: t.topicsRaw,
          dataRaw: t.dataRaw,
          txHash: t.txHash,
          toMuxedId: t.toMuxedId,
        };
      }
    } catch {
      /* transient RPC error — retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

function humanSummary(
  destType: AccountType,
  tokenSymbol: string,
  amount: string,
  mechanism: string,
  idMethod: WithdrawalIdMethod,
  idValue: string
): string {
  const dest =
    destType === "G" ? "a user's Classic (G) address" : "a user's Contract (C) address";
  const idSuffix =
    idMethod === "muxed"
      ? ` (muxed id ${idValue})`
      : idMethod === "memo"
        ? ` (memo id ${idValue})`
        : "";
  if (mechanism === "classic-native") {
    return `The exchange sent ${amount} ${tokenSymbol} from its G account to ${dest}${idSuffix} with a classic payment operation.`;
  }
  return `The exchange sent ${amount} ${tokenSymbol} from its G account to ${dest}${idSuffix} by invoking the token contract's transfer.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WithdrawRequest;
    const { destType, tokenKey } = body;
    const amount = (body.amount || "1").trim();

    if (!EXCHANGE_G) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_EXCHANGE_G is not configured." },
        { status: 500 }
      );
    }
    const exchangeSecret = process.env.EXCHANGE_G_SECRET;
    if (!exchangeSecret) {
      return NextResponse.json(
        { error: "EXCHANGE_G_SECRET is not configured (the exchange's signing key)." },
        { status: 500 }
      );
    }

    const token = findWithdrawalToken(destType, tokenKey);
    if (!token) {
      return NextResponse.json({ error: "Unknown token." }, { status: 400 });
    }
    if (!token.enabled || !token.contractId) {
      return NextResponse.json(
        { error: `Token "${token.label}" is not configured (set ${token.envVar}).` },
        { status: 400 }
      );
    }

    const destination = destType === "C" ? USER_CONTRACT_C : USER_G;
    if (!destination) {
      return NextResponse.json(
        {
          error:
            destType === "C"
              ? "NEXT_PUBLIC_USER_CONTRACT_C is not configured."
              : "NEXT_PUBLIC_USER_G is not configured.",
        },
        { status: 500 }
      );
    }

    checkAmount(amount);

    const exchange = StellarSdk.Keypair.fromSecret(exchangeSecret);
    if (exchange.publicKey() !== EXCHANGE_G) {
      return NextResponse.json(
        { error: "EXCHANGE_G_SECRET does not match NEXT_PUBLIC_EXCHANGE_G." },
        { status: 500 }
      );
    }

    const server = new StellarSdk.rpc.Server(RPC_URL);
    const stroops = toStroops(amount);

    // Resolve the optional routing id. Muxing only wraps an *account*, so it's
    // valid only for a G destination; a memo only becomes the on-chain
    // `to_muxed_id` on a *classic* payment. A method that doesn't fit those
    // rails falls back to a plain address; a malformed id is rejected.
    const reqId = body.idMethod ?? "none";
    const rawId = body.idValue ?? "";
    if (reqId !== "none" && !isValidU64(rawId)) {
      throw new BadRequest(
        `Invalid routing id "${rawId}" — it must be a whole number that fits in 64 bits.`
      );
    }
    const idValue = reqId === "none" ? "" : BigInt(rawId).toString();
    const useMuxed = reqId === "muxed" && destType === "G";
    const useMemo =
      reqId === "memo" && destType === "G" && token.mechanism === "classic-native";
    const idMethod: WithdrawalIdMethod = useMuxed
      ? "muxed"
      : useMemo
        ? "memo"
        : "none";
    // A muxed id folds into the destination address; a memo leaves the address
    // plain and rides on the transaction envelope instead.
    const muxedDest = useMuxed ? muxedAddress(USER_G, idValue) : null;

    const built = await withSourceLock(exchange.publicKey(), async () => {
      const source = await server.getAccount(exchange.publicKey());

      if (token.mechanism === "classic-native") {
        // Classic XLM payment: exchange G account → user G address. (Only valid
        // for a G destination — a contract can't receive a classic payment.)
        const tb = new StellarSdk.TransactionBuilder(source, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        }).addOperation(
          StellarSdk.Operation.payment({
            // Muxed id → an M… destination; memo/none → the plain G address.
            destination: muxedDest ?? destination,
            asset: StellarSdk.Asset.native(),
            amount,
          })
        );
        // A memo id surfaces as `to_muxed_id` in the emitted transfer event.
        if (useMemo) tb.addMemo(StellarSdk.Memo.id(idValue));
        return submitAndPoll(server, tb.setTimeout(120).build(), [exchange]);
      }

      // Contract transfer: the exchange G account invokes the token contract's
      // `transfer` with from = exchange G. Being the tx source, its signature
      // authorizes the move. Works for both G and C destinations.
      const contract = new StellarSdk.Contract(token.contractId);
      const tx = new StellarSdk.TransactionBuilder(source, {
        // Inclusion fee ceiling (2,000,000 stroops = 0.2 XLM). This is NOT the
        // total cost: submitAndPoll runs prepareTransaction(), which simulates
        // the invocation and adds the Soroban resource fee on top of this value.
        // We set it well above BASE_FEE (100 stroops) so the contract call won't
        // be priced out under fee surges — you're only charged what's actually used.
        fee: "2000000",
        networkPassphrase,
      })
        .addOperation(
          contract.call(
            "transfer",
            StellarSdk.Address.fromString(EXCHANGE_G).toScVal(),
            // A muxed M… address carries the id straight into the transfer;
            // otherwise the plain base address (G or C).
            StellarSdk.Address.fromString(muxedDest ?? destination).toScVal(),
            StellarSdk.nativeToScVal(stroops, { type: "i128" })
          )
        )
        .setTimeout(120)
        .build();
      return submitAndPoll(server, tx, [exchange]);
    });

    const event = await fetchEmittedEvent(server, {
      contractId: token.contractId,
      from: EXCHANGE_G,
      startLedger: built.ledger,
      txHash: built.hash,
    });

    return NextResponse.json({
      hash: built.hash,
      ledger: built.ledger,
      source: EXCHANGE_G,
      destination,
      destType,
      tokenSymbol: token.symbol,
      mechanism: token.mechanism,
      event,
      confirmedOnChain: !!event,
      idMethod,
      sentId: idMethod === "none" ? undefined : idValue,
      summary: humanSummary(
        destType,
        token.symbol,
        amount,
        token.mechanism,
        idMethod,
        idValue
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = err instanceof BadRequest ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
