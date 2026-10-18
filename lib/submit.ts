import * as StellarSdk from "@stellar/stellar-sdk";
import { MAX_AMOUNT, isValidAmount } from "@/lib/stellar";

/**
 * Server-only transaction plumbing shared by `/api/send` and `/api/withdraw`.
 */

/**
 * Per-account queue. Two requests that build from the same source account
 * would both read the same sequence number and one would fail with
 * `tx_bad_seq`, so everything from `getAccount` to confirmation runs one at a
 * time per source. In-process only — enough for a single dev/demo server.
 */
const queues = new Map<string, Promise<unknown>>();

export function withSourceLock<T>(source: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(source) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  queues.set(source, tail);
  void tail.then(() => {
    if (queues.get(source) === tail) queues.delete(source);
  });
  return run;
}

/**
 * Submit a tx via RPC (prepare first if it contains a Soroban op), then poll
 * until it lands.
 *
 * Pass `alreadyPrepared` for a transaction that has been simulated and
 * assembled by the caller — re-preparing it would only cost another round trip.
 */
export async function submitAndPoll(
  server: StellarSdk.rpc.Server,
  tx: StellarSdk.Transaction,
  signers: StellarSdk.Keypair[],
  { alreadyPrepared = false }: { alreadyPrepared?: boolean } = {}
): Promise<{ hash: string; ledger: number }> {
  const needsPrepare =
    !alreadyPrepared &&
    tx.operations.some((op) => op.type === "invokeHostFunction");
  let finalTx: StellarSdk.Transaction = tx;
  if (needsPrepare) {
    finalTx = await server.prepareTransaction(tx);
  }
  signers.forEach((s) => finalTx.sign(s));

  const send = await server.sendTransaction(finalTx);
  // sendTransaction only tells us whether the tx was *admitted* to the mempool.
  // Anything other than PENDING/DUPLICATE means it never queued, so polling
  // getTransaction would just spin until NOT_FOUND — surface a clear reason now.
  if (send.status === "ERROR") {
    throw new Error(
      "RPC rejected the transaction: " +
        JSON.stringify(send.errorResult ?? send, null, 2)
    );
  }
  if (send.status === "TRY_AGAIN_LATER") {
    throw new Error(
      "The network asked to try again later (TRY_AGAIN_LATER) — it didn't queue the transaction. Send it again."
    );
  }

  // PENDING (or DUPLICATE) → wait for it to land. A tx that was admitted but
  // then dropped (e.g. a stale sequence) stays NOT_FOUND forever, so after the
  // window we report that distinctly from an on-chain FAILED.
  let result = await server.getTransaction(send.hash);
  for (let i = 0; i < 45 && result.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    result = await server.getTransaction(send.hash);
  }
  if (result.status === "NOT_FOUND") {
    throw new Error(
      `Transaction ${send.hash} was submitted but hasn't appeared on-chain. ` +
        `It may still be pending or was dropped (often a duplicate submit). ` +
        `Check it on the explorer, then send again if it never lands.`
    );
  }
  if (result.status !== "SUCCESS") {
    // FAILED — include the result so the on-chain reason is visible.
    const detail =
      "resultXdr" in result && result.resultXdr
        ? " · " + result.resultXdr.toXDR("base64")
        : "";
    throw new Error(`Transaction ${send.hash} failed on-chain (${result.status})${detail}`);
  }
  return { hash: send.hash, ledger: result.ledger };
}

/**
 * Validation error for a request body — the route turns it into a 400 rather
 * than the generic 500.
 */
export class BadRequest extends Error {}

/** Shared amount check for both routes: decimal, ≤7 places, > 0, ≤ MAX_AMOUNT. */
export function checkAmount(amount: string) {
  if (!isValidAmount(amount)) {
    throw new BadRequest(
      `Invalid amount "${amount}" — use a positive number with at most 7 decimal places.`
    );
  }
  if (Number(amount) > MAX_AMOUNT) {
    throw new BadRequest(`Amount is capped at ${MAX_AMOUNT} per transfer in this demo.`);
  }
}
