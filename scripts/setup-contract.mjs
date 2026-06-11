// Initialize + fund the redeployed passkey-account contract for the demo's C-account source.
// Admin is a plain ed25519 keypair; we drive transfers via execute_as_admin (no passkey needed).
import * as SDK from "@stellar/stellar-sdk";

const RPC = "https://soroban-testnet.stellar.org";
const PASS = SDK.Networks.TESTNET;
const XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const CONTRACT = process.env.CONTRACT_ID;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!CONTRACT || !ADMIN_SECRET) { console.error("Set CONTRACT_ID and ADMIN_SECRET env"); process.exit(1); }

const rpc = new SDK.rpc.Server(RPC);
const admin = SDK.Keypair.fromSecret(ADMIN_SECRET);
console.log("Admin:", admin.publicKey(), "Contract:", CONTRACT);

async function send(buildOp, label) {
  const acct = await rpc.getAccount(admin.publicKey());
  const tx = new SDK.TransactionBuilder(acct, { fee: "1000000", networkPassphrase: PASS })
    .addOperation(buildOp).setTimeout(120).build();
  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(admin);
  const res = await rpc.sendTransaction(prepared);
  if (res.status === "ERROR") { console.error(label, "send ERROR:", JSON.stringify(res.errorResult)); throw new Error(label); }
  let r = await rpc.getTransaction(res.hash);
  for (let i = 0; i < 30 && r.status === "NOT_FOUND"; i++) { await new Promise(s=>setTimeout(s,1000)); r = await rpc.getTransaction(res.hash); }
  console.log(label, "->", r.status, res.hash);
  if (r.status === "FAILED") throw new Error(label + " failed");
  return r;
}

// 1) initialize(admin, dummy passkey)
const passkeyScVal = SDK.xdr.ScVal.scvMap([
  new SDK.xdr.ScMapEntry({ key: SDK.xdr.ScVal.scvSymbol("credential_id"), val: SDK.xdr.ScVal.scvBytes(new Uint8Array([1,2,3,4,5])) }),
  new SDK.xdr.ScMapEntry({ key: SDK.xdr.ScVal.scvSymbol("name"), val: SDK.xdr.ScVal.scvBytes(new Uint8Array([72,105])) }),
  new SDK.xdr.ScMapEntry({ key: SDK.xdr.ScVal.scvSymbol("public_key"), val: SDK.xdr.ScVal.scvBytes(new Uint8Array(65).fill(0)) }),
]);
const c = new SDK.Contract(CONTRACT);
try {
  await send(c.call("initialize", SDK.Address.fromString(admin.publicKey()).toScVal(), passkeyScVal), "initialize");
} catch (e) { console.log("initialize skipped/failed (maybe already initialized):", e.message); }

// 2) fund contract with 200 XLM via SAC transfer (from admin G -> contract C)
const xlm = new SDK.Contract(XLM_SAC);
const amount = SDK.nativeToScVal(200n * 10000000n, { type: "i128" });
await send(xlm.call("transfer",
  SDK.Address.fromString(admin.publicKey()).toScVal(),
  SDK.Address.fromString(CONTRACT).toScVal(),
  amount), "fund-contract-200-XLM");

console.log("DONE");
