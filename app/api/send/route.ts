import { NextRequest, NextResponse } from "next/server";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  RPC_URL,
  networkPassphrase,
  EXCHANGE_G,
  USER_G,
  USER_CONTRACT_C,
  ED25519_VERIFIER,
  DEPOSIT_ID,
  muxedAddress,
  toStroops,
} from "@/lib/stellar";
import { findToken, type AccountType } from "@/lib/tokens";
import { buildSmartAccountTx } from "@/lib/smartAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AddressingMethod = "muxed" | "memo";
type TrackingModel = "exchange" | "ramp";

interface SendRequest {
  accountType: AccountType;
  tokenKey: string;
  amount: string;
  addressing: AddressingMethod;
  model: TrackingModel;
  /**
   * Optional override for the deposit id carried as the memo / muxed id.
   * Defaults to the exchange-assigned DEPOSIT_ID. The guided flow sends a
   * different value here to simulate a user mistake (the on-chain transfer
   * then carries a `to_muxed_id` that won't match the deposit intent).
   */
  depositId?: string;
}

/**
 * Submit a tx via RPC (prepare first if it contains a Soroban op), then poll.
 *
 * Pass `alreadyPrepared` for a transaction that has been simulated and
 * assembled by the caller — re-preparing it would only cost another round trip.
 */
async function submitAndPoll(
  server: StellarSdk.rpc.Server,
  tx: StellarSdk.Transaction,
  signers: StellarSdk.Keypair[],
  { alreadyPrepared = false }: { alreadyPrepared?: boolean } = {}
) {
  const needsPrepare =
    !alreadyPrepared &&
    tx.operations.some((op) => op.type === "invokeHostFunction");
  let finalTx: StellarSdk.Transaction = tx;
  if (needsPrepare) {
    finalTx = await server.prepareTransaction(tx);
  }
  signers.forEach((s) => finalTx.sign(s));

  const send = await server.sendTransaction(finalTx);
  if (send.status === "ERROR") {
    throw new Error(
      "RPC rejected transaction: " +
        JSON.stringify(send.errorResult ?? send, null, 2)
    );
  }

  let result = await server.getTransaction(send.hash);
  for (let i = 0; i < 30 && result.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    result = await server.getTransaction(send.hash);
  }
  if (result.status !== "SUCCESS") {
    throw new Error(`Transaction ${send.hash} ended with status ${result.status}`);
  }
  return { hash: send.hash, ledger: result.ledger };
}

function humanSummary(
  accountType: AccountType,
  tokenSymbol: string,
  amount: string,
  addressing: AddressingMethod,
  model: TrackingModel,
  depositId: string
): string {
  const acct =
    accountType === "G" ? "Classic (G) account" : "Contract (C) account";
  if (model === "ramp") {
    return `Ramp model · ${acct} sent ${amount} ${tokenSymbol} to the ramp's plain address — tracked by source wallet + amount.`;
  }
  const dest =
    addressing === "memo"
      ? `a G address with memo \`${depositId}\``
      : "a Muxed (M) address";
  return `Exchange model · ${acct} sent ${tokenSymbol} to ${dest}.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SendRequest;
    const { accountType, tokenKey, amount } = body;
    let addressing: AddressingMethod = body.addressing;

    if (!EXCHANGE_G) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_EXCHANGE_G is not configured." },
        { status: 500 }
      );
    }

    const token = findToken(accountType, tokenKey);
    if (!token) {
      return NextResponse.json({ error: "Unknown token." }, { status: 400 });
    }
    if (!token.enabled || !token.contractId) {
      return NextResponse.json(
        { error: `Token "${token.label}" is not configured (set ${token.envVar}).` },
        { status: 400 }
      );
    }

    const model: TrackingModel = body.model ?? "exchange";
    const isRamp = model === "ramp";

    // Exchange-model addressing rules (the ramp model ignores addressing —
    // it sends to the plain ramp address and identifies by from + amount).
    if (accountType === "C") addressing = "muxed";
    if (addressing === "memo" && token.mechanism !== "classic-native") {
      addressing = "muxed";
    }

    const userSecret = process.env.USER_G_SECRET;
    const signerSecret = process.env.CONTRACT_SIGNER_SECRET;
    const server = new StellarSdk.rpc.Server(RPC_URL);
    const stroops = toStroops(amount || "1");
    const amountScVal = StellarSdk.nativeToScVal(stroops, { type: "i128" });

    // The id actually sent on-chain. Defaults to the exchange-assigned
    // DEPOSIT_ID; the guided flow may pass a mismatching value on purpose.
    const sendDepositId =
      body.depositId && /^\d+$/.test(body.depositId) ? body.depositId : DEPOSIT_ID;
    const muxedDest = muxedAddress(EXCHANGE_G, sendDepositId);
    const useMemo = !isRamp && addressing === "memo";
    // Ramp → plain ramp address; Exchange → muxed (or plain G when using a memo).
    const contractDest = isRamp ? EXCHANGE_G : muxedDest;
    const classicDest = isRamp || useMemo ? EXCHANGE_G : muxedDest;

    let built: { hash: string; ledger: number };

    if (accountType === "G") {
      if (!userSecret) {
        return NextResponse.json(
          { error: "USER_G_SECRET is not configured." },
          { status: 500 }
        );
      }
      const kp = StellarSdk.Keypair.fromSecret(userSecret);
      const source = await server.getAccount(kp.publicKey());

      if (token.mechanism === "classic-native") {
        // Classic payment operation (XLM). Memo id maps to to_muxed_id on-chain.
        const tb = new StellarSdk.TransactionBuilder(source, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        }).addOperation(
          StellarSdk.Operation.payment({
            destination: classicDest,
            asset: StellarSdk.Asset.native(),
            amount: amount || "1",
          })
        );
        if (useMemo) tb.addMemo(StellarSdk.Memo.id(sendDepositId));
        built = await submitAndPoll(server, tb.setTimeout(120).build(), [kp]);
      } else {
        // G account invokes the token contract's transfer (from = G, to = dest).
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
              StellarSdk.Address.fromString(USER_G).toScVal(),
              StellarSdk.Address.fromString(contractDest).toScVal(),
              amountScVal
            )
          )
          .setTimeout(120)
          .build();
        built = await submitAndPoll(server, tx, [kp]);
      }
    } else {
      // Contract account: the OpenZeppelin smart account calls the token's
      // `transfer` through its `execute` entry point. `execute` requires the
      // account's own authorization, so the transaction has to carry a signed
      // `AuthPayload` — see lib/smartAccount.ts. The signing keypair is the
      // account's one registered signer, not an admin with a bypass.
      if (!signerSecret) {
        return NextResponse.json(
          { error: "CONTRACT_SIGNER_SECRET is not configured." },
          { status: 500 }
        );
      }
      if (!USER_CONTRACT_C) {
        return NextResponse.json(
          { error: "NEXT_PUBLIC_USER_CONTRACT_C is not configured." },
          { status: 500 }
        );
      }
      if (!ED25519_VERIFIER) {
        return NextResponse.json(
          { error: "NEXT_PUBLIC_ED25519_VERIFIER is not configured." },
          { status: 500 }
        );
      }
      const accountSigner = StellarSdk.Keypair.fromSecret(signerSecret);
      // The fee payer is a plain classic account; it does not authorize the
      // transfer, it only pays for the transaction.
      const feePayer = StellarSdk.Keypair.fromSecret(userSecret ?? signerSecret);
      const source = await server.getAccount(feePayer.publicKey());

      const tx = await buildSmartAccountTx(server, {
        smartAccountId: USER_CONTRACT_C,
        verifierId: ED25519_VERIFIER,
        signer: accountSigner,
        target: token.contractId,
        targetFn: "transfer",
        targetArgs: [
          StellarSdk.Address.fromString(USER_CONTRACT_C).toScVal(),
          StellarSdk.Address.fromString(contractDest).toScVal(),
          amountScVal,
        ],
        source,
        networkPassphrase,
      });
      built = await submitAndPoll(server, tx, [feePayer], {
        alreadyPrepared: true,
      });
    }

    return NextResponse.json({
      hash: built.hash,
      ledger: built.ledger,
      destination: isRamp ? EXCHANGE_G : useMemo ? EXCHANGE_G : muxedDest,
      memoId: useMemo ? sendDepositId : undefined,
      depositId: isRamp ? undefined : sendDepositId,
      addressing: isRamp ? "muxed" : addressing,
      tokenSymbol: token.symbol,
      mechanism: token.mechanism,
      model,
      summary: humanSummary(
        accountType,
        token.symbol,
        amount || "1",
        addressing,
        model,
        sendDepositId
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
