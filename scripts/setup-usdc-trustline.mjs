// Establish a USDC trustline on a classic (G) account so the USDC SAC can
// credit it. USDC is a classic asset wrapped by a Stellar Asset Contract, so
// the recipient's base G account needs a trustline or transfer() fails with
// Error(Contract, #13) "trustline entry is missing for account".
//
// Reads config from .env.local. By default it trusts USDC for NEXT_PUBLIC_EXCHANGE_G
// using EXCHANGE_G_SECRET. Override the target with TARGET_SECRET / TARGET_G envs.
import * as SDK from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local parser (KEY=VALUE, ignores comments/blank lines).
function loadEnv() {
  const out = {};
  let raw = "";
  try {
    raw = readFileSync(join(root, ".env.local"), "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };

const RPC = env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org";
const PASS = SDK.Networks.TESTNET;
const USDC_SAC = env.NEXT_PUBLIC_USDC_SAC;
// Circle testnet USDC issuer (matches the GBBD47IF… note in .env.local). Override
// with USDC_ISSUER if needed; verified against the configured SAC below.
const USDC_ISSUER =
  env.USDC_ISSUER || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const TARGET_SECRET = env.TARGET_SECRET || env.EXCHANGE_G_SECRET;
const TARGET_G = env.TARGET_G || env.NEXT_PUBLIC_EXCHANGE_G;

if (!USDC_SAC) {
  console.error("NEXT_PUBLIC_USDC_SAC is not set in .env.local");
  process.exit(1);
}
if (!TARGET_SECRET) {
  console.error("No target secret found (set EXCHANGE_G_SECRET in .env.local)");
  process.exit(1);
}

const kp = SDK.Keypair.fromSecret(TARGET_SECRET);
if (TARGET_G && kp.publicKey() !== TARGET_G) {
  console.error(
    `Secret resolves to ${kp.publicKey()} but TARGET_G is ${TARGET_G} — mismatch, aborting.`
  );
  process.exit(1);
}

const usdc = new SDK.Asset("USDC", USDC_ISSUER);

// Safety check: the asset we're about to trust must hash to the configured SAC.
const derivedSac = usdc.contractId(PASS);
if (derivedSac !== USDC_SAC) {
  console.error(
    "ABORT: USDC:" +
      USDC_ISSUER +
      " derives SAC " +
      derivedSac +
      " which does NOT match NEXT_PUBLIC_USDC_SAC (" +
      USDC_SAC +
      ").\nSet USDC_ISSUER to the correct issuer for that SAC and re-run."
  );
  process.exit(1);
}

console.log("Account :", kp.publicKey());
console.log("Asset   : USDC:" + USDC_ISSUER);
console.log("SAC     :", USDC_SAC, "(verified)");
console.log("RPC     :", RPC);

const rpc = new SDK.rpc.Server(RPC);
const acct = await rpc.getAccount(kp.publicKey());

// changeTrust is idempotent: re-running with the default (max) limit on an
// already-trusted line just leaves it in place, so no pre-check is needed.
const tx = new SDK.TransactionBuilder(acct, {
  fee: SDK.BASE_FEE,
  networkPassphrase: PASS,
})
  .addOperation(SDK.Operation.changeTrust({ asset: usdc }))
  .setTimeout(120)
  .build();

tx.sign(kp);

const res = await rpc.sendTransaction(tx);
if (res.status === "ERROR") {
  console.error("send ERROR:", JSON.stringify(res.errorResult, null, 2));
  process.exit(1);
}

let r = await rpc.getTransaction(res.hash);
for (let i = 0; i < 30 && r.status === "NOT_FOUND"; i++) {
  await new Promise((s) => setTimeout(s, 1000));
  r = await rpc.getTransaction(res.hash);
}

console.log("changeTrust ->", r.status, res.hash);
if (r.status !== "SUCCESS") {
  console.error("Trustline not established. Status:", r.status);
  process.exit(1);
}
console.log("DONE — USDC trustline established. The account can now receive USDC.");
