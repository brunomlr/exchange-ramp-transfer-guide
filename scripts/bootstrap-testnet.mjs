// Rebuild the entire demo on a fresh testnet — run this after a testnet reset,
// or to stand the demo up from nothing.
//
//   node scripts/bootstrap-testnet.mjs
//
// A reset wipes accounts, contracts, trustlines and balances, but *not* your
// keypairs. So the only things this script needs are the three secrets already
// in .env.local; every public key, contract id and balance is rebuilt from them:
//
//   1. friendbot-fund the classic accounts (user G, exchange G)
//   2. build the contracts        (`stellar contract build`, skip with --skip-build)
//   3. re-wrap the SACs           (native XLM, and USDC if its issuer is up)
//   4. deploy ed25519-verifier → smart-account → fungible-token
//   5. fund the smart account with XLM so it can pay its own Soroban fees
//   6. mint DEMO to the user's G account and to the smart account
//   7. add USDC trustlines (balances still need Circle's faucet — see the notes)
//   8. rewrite the derived values in .env.local (a .bak is kept)
//
// Flags: --skip-build   reuse the wasm already in contracts/target
//        --dry-run      do everything except writing .env.local
import * as SDK from "@stellar/stellar-sdk";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const wasmDir = join(root, "contracts", "target", "wasm32v1-none", "release");

const args = new Set(process.argv.slice(2));
const SKIP_BUILD = args.has("--skip-build");
const DRY_RUN = args.has("--dry-run");

/** Minimal .env.local parser (KEY=VALUE, ignores comments and blank lines). */
function loadEnv() {
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
const PASSPHRASE = SDK.Networks.TESTNET;
const FRIENDBOT = "https://friendbot.stellar.org";
/** Circle's testnet USDC issuer. */
const USDC_ISSUER =
  env.USDC_ISSUER || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/** XLM sent to the smart account so it can pay for its own transfers. */
const FUND_XLM = 200n;
/** DEMO minted to each of the G wallet and the smart account. */
const MINT_DEMO = 1000n;
const DECIMALS = 7;
const ONE = 10n ** BigInt(DECIMALS);

const rpc = new SDK.rpc.Server(RPC);

// ── secrets ──────────────────────────────────────────────────────────────
function keypair(name, value) {
  if (!value) {
    console.error(`${name} is missing — set it in .env.local and re-run.`);
    process.exit(1);
  }
  try {
    return SDK.Keypair.fromSecret(value);
  } catch {
    console.error(`${name} is not a valid Stellar secret key (S…).`);
    process.exit(1);
  }
}

const user = keypair("USER_G_SECRET", env.USER_G_SECRET);
const exchange = keypair("EXCHANGE_G_SECRET", env.EXCHANGE_G_SECRET);
// The smart account's signer defaults to the user's own key, which is how the
// demo is wired; a separate CONTRACT_SIGNER_SECRET works too.
const accountSigner = env.CONTRACT_SIGNER_SECRET
  ? keypair("CONTRACT_SIGNER_SECRET", env.CONTRACT_SIGNER_SECRET)
  : user;

const step = (n, title) => console.log(`\n[${n}] ${title}`);

// ── tx plumbing ──────────────────────────────────────────────────────────
async function submit(kp, op, label, { fee = "10000000" } = {}) {
  const source = await rpc.getAccount(kp.publicKey());
  const tx = new SDK.TransactionBuilder(source, { fee, networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(180)
    .build();
  const needsPrepare = tx.operations.some((o) => o.type === "invokeHostFunction");
  const final = needsPrepare ? await rpc.prepareTransaction(tx) : tx;
  final.sign(kp);

  const sent = await rpc.sendTransaction(final);
  if (sent.status === "ERROR") {
    throw new Error(`${label}: RPC rejected — ${JSON.stringify(sent.errorResult)}`);
  }
  let res = await rpc.getTransaction(sent.hash);
  for (let i = 0; i < 40 && res.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await rpc.getTransaction(sent.hash);
  }
  if (res.status !== "SUCCESS") throw new Error(`${label}: ${res.status} (${sent.hash})`);
  console.log(`  ✓ ${label}`);
  return res;
}

async function accountExists(publicKey) {
  try {
    await rpc.getAccount(publicKey);
    return true;
  } catch {
    return false;
  }
}

// ── 1. classic accounts ──────────────────────────────────────────────────
step(1, "Funding classic accounts");
for (const [label, kp] of [
  ["user G", user],
  ["exchange G", exchange],
  ...(accountSigner === user ? [] : [["account signer", accountSigner]]),
]) {
  if (await accountExists(kp.publicKey())) {
    console.log(`  · ${label} ${kp.publicKey()} already funded`);
    continue;
  }
  const res = await fetch(`${FRIENDBOT}?addr=${kp.publicKey()}`);
  if (!res.ok) {
    throw new Error(`friendbot failed for ${label}: ${res.status} ${await res.text()}`);
  }
  console.log(`  ✓ ${label} ${kp.publicKey()} funded`);
}

// ── 2. build ─────────────────────────────────────────────────────────────
step(2, "Building contracts");
if (SKIP_BUILD) {
  console.log("  · --skip-build, reusing contracts/target");
} else {
  // Needs stellar-cli 25.2.0+: the OpenZeppelin crates enable soroban-sdk's
  // `experimental_spec_shaking_v2`, which a plain `cargo build` refuses.
  execFileSync("stellar", ["contract", "build"], {
    cwd: join(root, "contracts"),
    stdio: ["ignore", "ignore", "inherit"],
  });
  console.log("  ✓ stellar contract build");
}

// ── 3. Stellar Asset Contracts ───────────────────────────────────────────
// A SAC's id is derived from the asset and the network passphrase, so it is
// stable across resets — but the wrapper instance itself has to be recreated.
step(3, "Wrapping classic assets as SACs");

async function contractExists(contractId) {
  try {
    const key = SDK.xdr.ScVal.scvLedgerKeyContractInstance();
    const entry = await rpc.getContractData(contractId, key);
    return !!entry;
  } catch {
    return false;
  }
}

async function ensureSac(asset, label) {
  const id = asset.contractId(PASSPHRASE);
  if (await contractExists(id)) {
    console.log(`  · ${label} SAC already wrapped — ${id}`);
    return id;
  }
  try {
    await submit(user, SDK.Operation.createStellarAssetContract({ asset }), `wrap ${label} SAC`);
  } catch (err) {
    // USDC's issuer may not be back up yet after a reset. XLM must succeed.
    if (label === "XLM") throw err;
    console.log(`  ! ${label} SAC could not be wrapped: ${err.message}`);
    console.log(`    Its id is still ${id} — re-run once Circle's testnet issuer is back.`);
    return id;
  }
  console.log(`    ${label} SAC = ${id}`);
  return id;
}

const xlmSac = await ensureSac(SDK.Asset.native(), "XLM");
const usdcAsset = new SDK.Asset("USDC", USDC_ISSUER);
const usdcSac = await ensureSac(usdcAsset, "USDC");

// ── 4. OpenZeppelin contracts ────────────────────────────────────────────
step(4, "Deploying OpenZeppelin contracts");

async function uploadWasm(file, label) {
  const path = join(wasmDir, file);
  if (!existsSync(path)) {
    throw new Error(`${path} is missing — drop --skip-build, or run \`stellar contract build\`.`);
  }
  const res = await submit(
    user,
    SDK.Operation.uploadContractWasm({ wasm: readFileSync(path) }),
    `upload ${label}`
  );
  return res.returnValue.bytes();
}

async function deploy(wasmHash, constructorArgs, label) {
  const res = await submit(
    user,
    SDK.Operation.createCustomContract({
      address: SDK.Address.fromString(user.publicKey()),
      wasmHash,
      salt: randomBytes(32),
      constructorArgs,
    }),
    `deploy ${label}`
  );
  const id = SDK.Address.fromScVal(res.returnValue).toString();
  console.log(`    ${label} = ${id}`);
  return id;
}

const call = (kp, contractId, fn, callArgs, label) =>
  submit(kp, new SDK.Contract(contractId).call(fn, ...callArgs), label);

/**
 * `Signer::External(verifier, key_data)` as an ScVal. `Signer` is a Rust enum,
 * so it encodes as a vec led by the variant symbol; `key_data` is the raw
 * 32-byte ed25519 public key behind the G address.
 */
function externalSigner(verifierId, ed25519PublicKey) {
  return SDK.xdr.ScVal.scvVec([
    SDK.xdr.ScVal.scvSymbol("External"),
    SDK.Address.fromString(verifierId).toScVal(),
    SDK.xdr.ScVal.scvBytes(ed25519PublicKey),
  ]);
}

const verifierId = await deploy(
  await uploadWasm("ed25519_verifier.wasm", "ed25519-verifier"),
  [],
  "ed25519-verifier"
);

// One Default context rule, one External signer, no policies → 1-of-1.
const smartAccountId = await deploy(
  await uploadWasm("smart_account.wasm", "smart-account"),
  [
    SDK.xdr.ScVal.scvVec([externalSigner(verifierId, accountSigner.rawPublicKey())]),
    SDK.xdr.ScVal.scvMap([]),
  ],
  "smart-account"
);

const tokenId = await deploy(
  await uploadWasm("fungible_token.wasm", "fungible-token"),
  [
    SDK.Address.fromString(user.publicKey()).toScVal(),
    SDK.xdr.ScVal.scvU32(DECIMALS),
    SDK.nativeToScVal("Demo Token", { type: "string" }),
    SDK.nativeToScVal("DEMO", { type: "string" }),
  ],
  "fungible-token"
);

// ── 5+6. balances ────────────────────────────────────────────────────────
step(5, "Funding the smart account and minting DEMO");
const i128 = (v) => SDK.nativeToScVal(v, { type: "i128" });

await call(
  user,
  xlmSac,
  "transfer",
  [
    SDK.Address.fromString(user.publicKey()).toScVal(),
    SDK.Address.fromString(smartAccountId).toScVal(),
    i128(FUND_XLM * ONE),
  ],
  `fund smart account with ${FUND_XLM} XLM`
);

for (const [label, addr] of [
  ["user G", user.publicKey()],
  ["smart account", smartAccountId],
]) {
  await call(
    user,
    tokenId,
    "mint",
    [SDK.Address.fromString(addr).toScVal(), i128(MINT_DEMO * ONE)],
    `mint ${MINT_DEMO} DEMO to ${label}`
  );
}

// ── 7. USDC trustlines ───────────────────────────────────────────────────
// USDC is a classic asset behind a SAC, so a G account without a trustline
// makes transfer() fail with Error(Contract, #13). changeTrust is idempotent.
step(6, "Adding USDC trustlines");
let usdcReady = true;
for (const [label, kp] of [
  ["user G", user],
  ["exchange G", exchange],
]) {
  try {
    await submit(
      kp,
      SDK.Operation.changeTrust({ asset: usdcAsset }),
      `USDC trustline on ${label}`,
      { fee: SDK.BASE_FEE }
    );
  } catch (err) {
    usdcReady = false;
    console.log(`  ! ${label}: ${err.message}`);
  }
}

// ── 8. write .env.local ──────────────────────────────────────────────────
step(7, "Updating .env.local");
const derived = {
  NEXT_PUBLIC_USER_G: user.publicKey(),
  NEXT_PUBLIC_EXCHANGE_G: exchange.publicKey(),
  NEXT_PUBLIC_USER_CONTRACT_C: smartAccountId,
  NEXT_PUBLIC_ED25519_VERIFIER: verifierId,
  NEXT_PUBLIC_XLM_SAC: xlmSac,
  NEXT_PUBLIC_USDC_SAC: usdcSac,
  NEXT_PUBLIC_SEP41_TOKEN: tokenId,
};

if (DRY_RUN) {
  console.log("  · --dry-run, not writing. Values:");
  for (const [k, v] of Object.entries(derived)) console.log(`    ${k}=${v}`);
} else if (!existsSync(envPath)) {
  console.log("  ! .env.local does not exist. Copy .env.example to it, add your");
  console.log("    secrets, and paste these in:");
  for (const [k, v] of Object.entries(derived)) console.log(`    ${k}=${v}`);
} else {
  copyFileSync(envPath, `${envPath}.bak`);
  // Rewrite in place so comments and the secret lines survive untouched.
  const updated = readFileSync(envPath, "utf8")
    .split("\n")
    .map((line) => {
      const eq = line.indexOf("=");
      if (eq === -1 || line.trim().startsWith("#")) return line;
      const key = line.slice(0, eq).trim();
      return key in derived ? `${key}=${derived[key]}` : line;
    })
    .join("\n");
  writeFileSync(envPath, updated);
  console.log("  ✓ .env.local updated (previous copy at .env.local.bak)");
}

console.log(`
Done. The demo is live again on ${RPC}.

  user G          ${user.publicKey()}
  exchange G      ${exchange.publicKey()}
  smart account   ${smartAccountId}
  ed25519 verifier ${verifierId}
  DEMO token      ${tokenId}
  XLM SAC         ${xlmSac}
  USDC SAC        ${usdcSac}
${
  usdcReady
    ? "\nUSDC trustlines are in place, but the accounts hold 0 USDC — testnet USDC\ncomes from Circle's faucet (https://faucet.circle.com), which this script\ncannot drive. The USDC option will fail until you top them up."
    : "\nUSDC is not usable yet: the trustlines could not be created, most likely\nbecause Circle's testnet issuer has not been recreated after the reset.\nRe-run this script later, or use `node scripts/setup-usdc-trustline.mjs`."
}

Restart the dev server so it picks up the new .env.local:  rm -rf .next && npm run dev
`);
