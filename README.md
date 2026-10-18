# Exchange & Ramp Transfer Guide

An interactive, step-by-step guide for **exchanges and ramps** integrating
Stellar. It walks through crypto moving **in** (deposits / off-ramps) and
**out** (withdrawals / on-ramps), with real transactions on testnet, and shows
how to detect incoming transfers using **Stellar RPC alone, with no Horizon**.

**Live demo:** <https://guided-deposit-withdrawal.vercel.app> (testnet)

## The key idea

Since Protocol 23, [CAP-67 unified asset events](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md)
make every asset movement emit the same `transfer` event on the asset's
contract, whichever way it was sent:

| How the user sends | Event emitted on |
|---|---|
| Classic `payment` op (XLM, or any classic asset) | The asset's Stellar Asset Contract (SAC) |
| SAC `transfer` call | The SAC |
| Custom SEP-41 token `transfer` call | The token contract |

The event carries the per-user routing id in its data as `to_muxed_id`:

```text
topics: ["transfer", from: Address, to: Address, "native"]   ← SACs add the SEP-11 asset;
                                                                custom SEP-41 tokens stop at `to`
data:   i128                                                 ← plain destination
     or { amount: i128, to_muxed_id: u64 | string | bytes }  ← muxed M… destination, or a memo
```

`to` is always the base `G…`/`C…` address. The id lands in `to_muxed_id` both
when the user sends to a **muxed (`M…`) address** and when they send a
**classic payment with a memo**: a memo id arrives as `u64`, a text memo as
`string`, a hash memo as `bytes`.

So an exchange needs **one check**: read `to_muxed_id` and compare it to the
user's deposit id. It works across XLM, SAC tokens and custom SEP-41 tokens,
and for senders on Classic (`G`) and Contract (`C`) accounts.

## What the guide covers

The two flows are named by the direction the crypto moves relative to the
exchange or ramp:

| Flow | Exchange model | Ramp model |
|---|---|---|
| **Incoming** (`/incoming`) | Deposit: the user funds their account | Off-ramp: crypto in, fiat out |
| **Outgoing** (`/outgoing`) | Withdrawal: the user pulls funds out | On-ramp: fiat in, crypto out |

The two models identify the user differently:

- **Exchange model.** One omnibus account. Each user gets a deposit id, sent as
  a muxed address or a memo, and the deposit is matched on `to_muxed_id`.
- **Ramp model.** The user sends to the ramp's plain address. The ramp matches
  on `from` (the user's wallet) and, when the rate is locked, the exact amount.

### Incoming: four steps

1. **Source & token.** A Classic (`G`) account or a Contract (`C`) account (an
   OpenZeppelin smart account), plus XLM, USDC or a custom SEP-41 token.
2. **Identification model.** Exchange or ramp. This picks the destination and
   what gets matched. It also shows what an exchange's deposit screen would
   tell the user.
3. **Send.** The server builds, signs and submits the transaction over RPC.
   The deposit id and amount are editable, so you can send a mismatch on
   purpose and watch detection reject it.
4. **Detection.** Polls `getEvents`, finds the transfer and shows how it was
   matched: the real topics, the event data, and the match check.

### Outgoing: three steps

1. **Destination & token.** The user's `G` or `C` address. A contract can't
   receive a classic payment, so a `C` destination always goes through the
   token contract's `transfer`, even for XLM.
2. **Build.** Set the amount and an optional routing id (muxed or memo, for a
   custodial destination). It explains how the transaction is built and shows
   the real `@stellar/stellar-sdk` code for it.
3. **Send & confirm.** Submits from the exchange's `G` account and reads back
   the emitted transfer event.

## Detecting deposits with RPC

The core of `lib/events.ts`, simplified:

```ts
const TRANSFER = xdr.ScVal.scvSymbol("transfer").toXDR("base64");

const { events, cursor } = await server.getEvents({
  startLedger, // first call only; afterwards pass `cursor`
  filters: [{
    type: "contract",
    contractIds: [XLM_SAC, USDC_SAC, SEP41_TOKEN],
    // A topic filter matches only events with the same number of topics,
    // so register both shapes: SAC (4 topics) and custom SEP-41 (3).
    topics: [[TRANSFER, "*", "*", "*"], [TRANSFER, "*", "*"]],
  }],
});

for (const ev of events) {
  const [, from, to] = ev.topic.map(scValToNative);
  const data = scValToNative(ev.value);
  const toMuxedId = typeof data === "bigint" ? undefined : data.to_muxed_id;
  if (to === EXCHANGE_G && String(toMuxedId) === depositId) {
    // credit the user
  }
}
```

The browser polls this every 3 seconds (`lib/useTransferEvents.ts`) and resumes
from the returned cursor.

## Quick start

### Prerequisites

- Node.js 20+
- To deploy your own contracts: Rust with the `wasm32v1-none` target
  (`rustup target add wasm32v1-none`) and
  [stellar-cli](https://developers.stellar.org/docs/tools/cli) **25.2.0+**

### Setup

```bash
npm install
cp .env.example .env.local
```

Generate testnet keypairs and put their secrets (`S…`) in `.env.local`:

```bash
stellar keys generate user     && stellar keys secret user       # → USER_G_SECRET
stellar keys generate exchange && stellar keys secret exchange   # → EXCHANGE_G_SECRET
```

`CONTRACT_SIGNER_SECRET` is the smart account's signer. Use a third key, or
the same value as `USER_G_SECRET`.

Then deploy everything and fill in the remaining variables:

```bash
node scripts/bootstrap-testnet.mjs
npm run dev    # http://localhost:3000
```

Restart the dev server whenever `.env.local` changes. `NEXT_PUBLIC_*` values
are inlined at build time.

## Configuration

All values are **testnet only**. Don't reuse these keys anywhere else.

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | Stellar RPC endpoint (testnet) |
| `NEXT_PUBLIC_EXCHANGE_G` | The exchange's base `G` account (deposit destination, withdrawal source) |
| `NEXT_PUBLIC_DEPOSIT_ID` | The demo user's deposit id (memo id / muxed id) |
| `NEXT_PUBLIC_USER_G` | The user's classic wallet |
| `NEXT_PUBLIC_USER_CONTRACT_C` | The user's contract wallet (OpenZeppelin smart account) |
| `NEXT_PUBLIC_ED25519_VERIFIER` | Verifier contract the smart account's signer is registered against |
| `NEXT_PUBLIC_XLM_SAC` | Native XLM Stellar Asset Contract |
| `NEXT_PUBLIC_USDC_SAC`, `NEXT_PUBLIC_SEP41_TOKEN` | Optional. Each enables its token option when set |
| `USER_G_SECRET` | **Server only.** Signs `G`-account deposits, and pays the fee for every deposit |
| `CONTRACT_SIGNER_SECRET` | **Server only.** The smart account's registered ed25519 signer |
| `EXCHANGE_G_SECRET` | **Server only.** Signs withdrawals from `NEXT_PUBLIC_EXCHANGE_G` |

`bootstrap-testnet.mjs` writes every `NEXT_PUBLIC_*` value except the RPC URL
and the deposit id.

## Project layout

```text
app/
  incoming/, outgoing/       the two guided flows
  api/send/route.ts          builds, signs and submits deposits (G or C source)
  api/withdraw/route.ts      builds, signs and submits withdrawals from the exchange
components/guided/           step UI, detection panel, SDK code snippets
lib/
  events.ts                  getEvents filter + CAP-67 transfer decoding
  useTransferEvents.ts       browser polling hook
  smartAccount.ts            signed AuthPayload for the OpenZeppelin smart account
  submit.ts                  submit + poll, per-account queue, amount check
  tokens.ts                  token options and send mechanism per account type
contracts/                   Soroban contracts (Cargo workspace)
scripts/bootstrap-testnet.mjs  one-shot testnet deploy / recovery
```

## Contracts

`contracts/` is a Cargo workspace of three
[OpenZeppelin Stellar](https://github.com/OpenZeppelin/stellar-contracts)
contracts, pinned to the `0.7.2` crates (built against `soroban-sdk` 26.1):

| Crate | What it is |
|---|---|
| `fungible-token` | The "Custom SEP-41 token" (DEMO). OZ `stellar-tokens` `Base` with ownable minting. `transfer` takes a `MuxedAddress` and emits the CAP-67 event. |
| `smart-account` | The user's Contract (`C`) wallet. OZ `stellar-accounts` smart account: one `Default` context rule, one `External` ed25519 signer, no policies (1-of-1). |
| `ed25519-verifier` | Stateless signature verifier the smart account checks its signer against. Reusable across accounts. |

### Build

```bash
cd contracts && stellar contract build
```

This needs stellar-cli 25.2.0+. The OZ crates enable soroban-sdk's
`experimental_spec_shaking_v2` feature, and a plain `cargo build` refuses to
build with it.

### Deploy, or recover from a testnet reset

A testnet reset wipes accounts, contracts, trustlines and balances. Your
keypairs survive it. One script rebuilds the whole demo from the three secrets
in `.env.local`:

```bash
node scripts/bootstrap-testnet.mjs
```

What it does:

1. Funds the classic accounts with friendbot.
2. Builds the contracts.
3. Wraps the XLM and USDC SACs.
4. Deploys verifier → smart account → token.
5. Funds the smart account with XLM, and mints DEMO to the user `G`, the
   smart account and the exchange `G`.
6. Adds USDC trustlines.
7. Rewrites the derived values in `.env.local`, keeping a `.env.local.bak`.

| Flag | Effect |
|---|---|
| `--skip-build` | Reuse the wasm already in `contracts/target` |
| `--dry-run` | Deploy and fund, but print the env values instead of writing them |

**USDC** is the one asset the script can't mint. Get testnet USDC for the `G`
accounts from [Circle's faucet](https://faucet.circle.com), including the
exchange `G`, or outgoing USDC has nothing to send. The smart account holds
whatever a funded `G` account sends it; a contract holds a SAC balance without
a trustline. An account with no USDC fails the USDC option with
`Error(Contract, #10)`, the SAC's insufficient-balance error.

### How the C account authorizes a deposit

The smart account has no admin bypass. Its `execute(target, fn, args)` entry
point calls `require_auth()` on itself, so `/api/send` attaches a signed
`AuthPayload` (`lib/smartAccount.ts`):

1. **Simulate** the `execute` call. The host records the account's auth entry
   and picks a nonce, but doesn't run `__check_auth`.
2. **Sign** `sha256(signature_payload || xdr(context_rule_ids))`, not the raw
   host payload. Binding the rule ids into the digest stops a signature from
   being replayed against a weaker context rule.
3. **Simulate again** with the signed entry attached. This pass runs
   `__check_auth` and the verifier, so the footprint and resource fee cover the
   whole call.

## Limits and caveats

- **Testnet only.** Every key and contract here is a demo value.
- **No authentication on the API routes.** `/api/send` and `/api/withdraw`
  sign with the server's secrets for anyone who can reach them. Each request
  is capped at 100 units (`MAX_AMOUNT` in `lib/stellar.ts`).
- **Sequence collisions.** Submissions are queued per source account within
  one server process. On serverless hosting, simultaneous requests can still
  fail with `tx_bad_seq`; send again if that happens.
- **Shared wallets.** Everyone using one deployment sends from the same
  wallets, so balances drain over time. Top them up, or re-run the bootstrap
  after a reset.

## Troubleshooting

**Sends hang or take very long in dev.** A corrupted `.next` cache can make
`next dev` (Turbopack) spin at high CPU and starve the event loop, so every RPC
round-trip crawls. The contract path is the heaviest, so it looks like it
hangs. Normal timings are about 1–2 s for a classic send and 4–6 s for a
contract send.

```bash
rm -rf .next && npm run dev
```

If Turbopack still misbehaves, use the webpack dev server:

```bash
rm -rf .next && npm run dev:webpack
```

Always `rm -rf .next` when switching between `dev` and `dev:webpack`. Mixing
their build artifacts in one `.next` is what corrupts the cache.

**`Error(Contract, #13)`** means a `G` account has no USDC trustline. Re-run
the bootstrap, or `node scripts/setup-usdc-trustline.mjs`, which defaults to
the exchange account and takes `TARGET_SECRET` / `TARGET_G` for another one.

**`Error(Contract, #10)`** means insufficient balance. See the USDC notes
above.
