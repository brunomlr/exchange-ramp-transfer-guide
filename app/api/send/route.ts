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
  isValidU64,
  muxedAddress,
  toStroops,
} from "@/lib/stellar";
import { findToken, type AccountType } from "@/lib/tokens";
import { buildSmartAccountTx } from "@/lib/smartAccount";
import { BadRequest, checkAmount, submitAndPoll, withSourceLock } from "@/lib/submit";

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
    const { accountType, tokenKey } = body;
    const amount = (body.amount || "1").trim();
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
    checkAmount(amount);

    const model: TrackingModel = body.model ?? "exchange";
    const isRamp = model === "ramp";

    // Exchange-model addressing rules (the ramp model ignores addressing —
    // it sends to the plain ramp address and identifies by from + amount).
    if (accountType === "C") addressing = "muxed";
    if (addressing === "memo" && token.mechanism !== "classic-native") {
      addressing = "muxed";
    }

    // The id actually sent on-chain. Defaults to the exchange-assigned
    // DEPOSIT_ID; the guided flow may pass a mismatching value on purpose.
    if (!isRamp && body.depositId && !isValidU64(body.depositId)) {
      throw new BadRequest(
        `Invalid deposit id "${body.depositId}" — it must be a whole number that fits in 64 bits.`
      );
    }
    const sendDepositId = BigInt(
      (!isRamp && body.depositId) || DEPOSIT_ID
    ).toString();

    const userSecret = process.env.USER_G_SECRET;
    const signerSecret = process.env.CONTRACT_SIGNER_SECRET;
    const server = new StellarSdk.rpc.Server(RPC_URL);
    const amountScVal = StellarSdk.nativeToScVal(toStroops(amount), { type: "i128" });

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
      // The UI shows USER_G as the sender and the ramp model matches on it,
      // so the signing key has to be that account.
      if (kp.publicKey() !== USER_G) {
        return NextResponse.json(
          { error: "USER_G_SECRET does not match NEXT_PUBLIC_USER_G." },
          { status: 500 }
        );
      }

      built = await withSourceLock(kp.publicKey(), async () => {
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
              amount,
            })
          );
          if (useMemo) tb.addMemo(StellarSdk.Memo.id(sendDepositId));
          return submitAndPoll(server, tb.setTimeout(120).build(), [kp]);
        }

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
              StellarSdk.Address.fromString(kp.publicKey()).toScVal(),
              StellarSdk.Address.fromString(contractDest).toScVal(),
              amountScVal
            )
          )
          .setTimeout(120)
          .build();
        return submitAndPoll(server, tx, [kp]);
      });
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
      // transfer, it only pays for the transaction. `||`, not `??`, so a blank
      // USER_G_SECRET= line falls back too.
      const feePayer = StellarSdk.Keypair.fromSecret(userSecret || signerSecret);

      built = await withSourceLock(feePayer.publicKey(), async () => {
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
        return submitAndPoll(server, tx, [feePayer], { alreadyPrepared: true });
      });
    }

    return NextResponse.json({
      hash: built.hash,
      ledger: built.ledger,
      amount,
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
        amount,
        addressing,
        model,
        sendDepositId
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = err instanceof BadRequest ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
