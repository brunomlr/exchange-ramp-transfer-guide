import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Server-only helpers for driving the user's Contract (C) account — an
 * OpenZeppelin smart account (`contracts/smart-account`).
 *
 * Unlike a classic G account, a smart account has no built-in signature check:
 * the Soroban host calls its `__check_auth`, and OpenZeppelin's
 * `smart_account::do_check_auth` resolves the invocation against a *context
 * rule* and verifies each signer through a verifier contract.
 *
 * Two consequences shape the code below.
 *
 * 1. **Signers don't sign the host's payload.** They sign
 *    `sha256(signature_payload || xdr(context_rule_ids))`. Binding the rule ids
 *    into the digest stops a collected signature from being replayed against a
 *    weaker rule. See `authDigest`.
 *
 * 2. **The transaction must be simulated twice.** The first simulation runs in
 *    recording mode — the host invents the auth entry (and its nonce) but never
 *    executes `__check_auth`. Only once the signed entry is attached does a
 *    second simulation actually run the verifier, which is what produces a
 *    truthful resource footprint. See `buildSmartAccountTx`.
 */

const { xdr, Address, hash } = StellarSdk;

/** The demo installs one context rule at deploy time, so its id is 0. */
export const DEFAULT_CONTEXT_RULE_ID = 0;

/**
 * `Signer::External(verifier, key_data)` as an ScVal.
 *
 * `Signer` is a Rust enum, so it encodes as a vec led by the variant symbol.
 * `key_data` is the raw 32-byte ed25519 public key — a G address with its
 * strkey version byte and checksum stripped.
 */
export function externalSigner(
  verifierId: string,
  ed25519PublicKey: Buffer
): StellarSdk.xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    Address.fromString(verifierId).toScVal(),
    xdr.ScVal.scvBytes(ed25519PublicKey),
  ]);
}

/** `AuthPayload { signers, context_rule_ids }` as an ScVal. */
function authPayload(
  signatures: { signer: StellarSdk.xdr.ScVal; signature: Buffer }[],
  contextRuleIds: number[]
): StellarSdk.xdr.ScVal {
  // A `#[contracttype]` struct encodes as a map keyed by field-name symbols in
  // sorted order: "context_rule_ids" before "signers".
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("context_rule_ids"),
      val: xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signers"),
      val: xdr.ScVal.scvMap(
        signatures.map(
          ({ signer, signature }) =>
            new xdr.ScMapEntry({ key: signer, val: xdr.ScVal.scvBytes(signature) })
        )
      ),
    }),
  ]);
}

/**
 * The digest an OpenZeppelin smart account signer must actually sign:
 *
 *   signature_payload = sha256(XDR(HashIdPreimage::SorobanAuthorization))
 *   auth_digest       = sha256(signature_payload || XDR(context_rule_ids))
 */
function authDigest(
  entry: StellarSdk.xdr.SorobanAuthorizationEntry,
  networkPassphrase: string,
  contextRuleIds: number[]
): Buffer {
  const credentials = entry.credentials().address();
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(networkPassphrase)),
      nonce: credentials.nonce(),
      signatureExpirationLedger: credentials.signatureExpirationLedger(),
      invocation: entry.rootInvocation(),
    })
  );
  const signaturePayload = hash(preimage.toXDR());
  const ruleIdsXdr = xdr.ScVal
    .scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id)))
    .toXDR();
  return hash(Buffer.concat([signaturePayload, ruleIdsXdr]));
}

/**
 * Build a transaction that calls the smart account's `execute` entry point,
 * with a fully signed `AuthPayload` attached and a resource footprint measured
 * against the real `__check_auth` run.
 *
 * @param opts.smartAccountId  The C address of the smart account.
 * @param opts.verifierId      The ed25519 verifier the account's signer uses.
 * @param opts.signer          The keypair whose public key is that signer.
 * @param opts.target          Contract the account should call (the token).
 * @param opts.targetFn        Function on that contract (`"transfer"`).
 * @param opts.targetArgs      Arguments to it.
 * @param opts.source          Account paying the fee and sequence number.
 */
export async function buildSmartAccountTx(
  server: StellarSdk.rpc.Server,
  opts: {
    smartAccountId: string;
    verifierId: string;
    signer: StellarSdk.Keypair;
    target: string;
    targetFn: string;
    targetArgs: StellarSdk.xdr.ScVal[];
    source: StellarSdk.Account;
    networkPassphrase: string;
    fee?: string;
  }
): Promise<StellarSdk.Transaction> {
  const {
    smartAccountId,
    verifierId,
    signer,
    target,
    targetFn,
    targetArgs,
    source,
    networkPassphrase,
    fee = "3000000",
  } = opts;

  const account = new StellarSdk.Contract(smartAccountId);
  const call = () =>
    account.call(
      "execute",
      Address.fromString(target).toScVal(),
      StellarSdk.nativeToScVal(targetFn, { type: "symbol" }),
      xdr.ScVal.scvVec(targetArgs)
    );

  // `TransactionBuilder` bumps the sequence number of the account it is given,
  // and we build twice, so both passes start from this snapshot.
  const startSequence = source.sequenceNumber();
  const at = () => new StellarSdk.Account(source.accountId(), startSequence);

  // Pass 1 — recording mode. The host records the account's auth requirement
  // and picks a nonce for it, but does not execute `__check_auth`.
  const recorded = new StellarSdk.TransactionBuilder(at(), { fee, networkPassphrase })
    .addOperation(call())
    .setTimeout(180)
    .build();

  const recording = await server.simulateTransaction(recorded);
  if (StellarSdk.rpc.Api.isSimulationError(recording)) {
    throw new Error(`Smart account simulation failed: ${recording.error}`);
  }
  const entries = recording.result?.auth ?? [];
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one auth entry for the smart account, got ${entries.length}.`
    );
  }

  // Sign that entry as the account's External signer. One auth context here,
  // so one context rule id.
  const entry = entries[0];
  const contextRuleIds = [DEFAULT_CONTEXT_RULE_ID];
  const credentials = entry.credentials().address();
  credentials.signatureExpirationLedger(recording.latestLedger + 60);
  credentials.signature(
    authPayload(
      [
        {
          signer: externalSigner(verifierId, signer.rawPublicKey()),
          signature: signer.sign(authDigest(entry, networkPassphrase, contextRuleIds)),
        },
      ],
      contextRuleIds
    )
  );

  // Pass 2 — enforcing mode. With the signed entry attached the host really
  // runs `__check_auth` (and through it the verifier contract), so the
  // footprint and resource fee now cover the whole call.
  const authorized = new StellarSdk.TransactionBuilder(at(), { fee, networkPassphrase })
    .addOperation(
      StellarSdk.Operation.invokeHostFunction({
        func: call().body().invokeHostFunctionOp().hostFunction(),
        auth: [entry],
      })
    )
    .setTimeout(180)
    .build();

  const enforcing = await server.simulateTransaction(authorized);
  if (StellarSdk.rpc.Api.isSimulationError(enforcing)) {
    throw new Error(`Smart account authorization failed: ${enforcing.error}`);
  }
  return StellarSdk.rpc.assembleTransaction(authorized, enforcing).build();
}
