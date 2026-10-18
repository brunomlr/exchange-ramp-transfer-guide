# Ramps / Exchanges Transfer Simulator

A Stellar testnet demo of moving crypto to and from a ramp or exchange, and
**detecting it in real time using Stellar RPC only — no Horizon**.

It demonstrates the **CAP-67 unified asset events** (live since Protocol 23): a
classic `payment`, a SAC `transfer`, and a SEP-41 contract `transfer` all emit
the *same* `transfer` event on the asset's contract, carrying `to_muxed_id` in
the data. So a **single check** — read `to_muxed_id`, compare to the exchange's
deposit id — identifies the depositing user across every token type and across
both Classic (G) and Contract (C) source accounts.

## How it works

Two guided walkthroughs, named by the direction the crypto moves relative to the
ramp/exchange. What each means for the user depends on the model — the exchange
model (one omnibus account + a per-user id) or the ramp model (tracking a wallet
address, optionally pinned to an amount).

**`/incoming`** — the user sends crypto in (a *deposit* for an exchange, an
*off-ramp* for a ramp), in four steps:

1. **Source & token** — Classic (`G`) or Contract (`C`) account, and which token.
2. **Identification model** — exchange or ramp; this decides the destination and
   what gets matched on-chain.
3. **Send** — built and signed server-side in `app/api/send`, submitted with
   `rpc.sendTransaction`. The id (or amount) is editable, so you can deliberately
   send something that won't match and watch detection fail.
4. **Detection** — polls `rpc.getEvents` for `transfer` events and shows a
   "how it was detected" breakdown: the real topics, the event data, and the
   match check. For a classic `G` payment that used a **memo**, the memo arrives
   as the same `to_muxed_id`.

**`/outgoing`** — the ramp/exchange sends crypto out of its own `G` account (a
*withdrawal*, or an *on-ramp*) to a user `G` or `C` address, in three steps:
destination & token, build (with the real `@stellar/stellar-sdk` code for the
transaction shown inline), then send & confirm with the emitted event.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

Config lives in `.env.local` (see `.env.example`). All addresses/keys are
**testnet demo values** — never use in production.

| Var | Meaning |
|-----|---------|
| `NEXT_PUBLIC_RPC_URL` | Stellar RPC endpoint (testnet) |
| `NEXT_PUBLIC_EXCHANGE_G` | Exchange base G account (deposit destination) |
| `NEXT_PUBLIC_DEPOSIT_ID` | Fixed demo deposit id (memo id / muxed id) |
| `NEXT_PUBLIC_USER_G` | User's classic wallet (sender) |
| `NEXT_PUBLIC_USER_CONTRACT_C` | User's contract account (sender) — the OpenZeppelin smart account |
| `NEXT_PUBLIC_ED25519_VERIFIER` | Verifier the smart account's signer is registered against |
| `NEXT_PUBLIC_XLM_SAC` | Native XLM Stellar Asset Contract |
| `NEXT_PUBLIC_USDC_SAC` / `NEXT_PUBLIC_SEP41_TOKEN` | Optional tokens — each enables its option when set |
| `USER_G_SECRET` / `CONTRACT_SIGNER_SECRET` | **Server-side only** — sign deposits (`/api/send`): the G wallet, and the smart account's registered signer |
| `EXCHANGE_G_SECRET` | **Server-side only** — signs withdrawals (`/api/withdraw`) from the exchange's G account |

Both API routes reject amounts above 100 (`MAX_AMOUNT` in `lib/stellar.ts`) and
queue submissions per source account so concurrent sends don't collide on the
sequence number. They have **no authentication** — they sign with the secrets
above for anyone who can reach them, so don't expose a running instance
publicly.

## Contracts

Everything this demo deploys lives in `contracts/` — a Cargo workspace of three
[OpenZeppelin Stellar](https://github.com/OpenZeppelin/stellar-contracts)
contracts, pinned to the published `0.7.2` crates (which build against
`soroban-sdk` 26.1):

| Crate | What it is |
|-------|------------|
| `fungible-token` | The "Custom SEP-41 token" option. OZ `stellar-tokens` `Base` + `stellar-access` ownable. Its `transfer` takes a `MuxedAddress` and emits the CAP-67 event the simulator matches on. |
| `smart-account` | The user's Contract (C) wallet — `NEXT_PUBLIC_USER_CONTRACT_C`. OZ `stellar-accounts` smart account: one `Default` context rule, one `External` ed25519 signer, no policies (1-of-1). |
| `ed25519-verifier` | Stateless signature oracle the smart account's signer is checked against. Reusable across accounts. |

### Build

`stellar contract build` needs **stellar-cli 25.2.0+** — the OZ crates enable
soroban-sdk's `experimental_spec_shaking_v2` feature, and a plain `cargo build`
is rejected with a message saying so.

```bash
cd contracts && stellar contract build
```

### Deploy / recover from a testnet reset

A testnet reset wipes accounts, contracts, trustlines and balances — but not
your keypairs. One script rebuilds the whole demo from the three secrets in
`.env.local`:

```bash
node scripts/bootstrap-testnet.mjs
```

It friendbot-funds the classic accounts, builds the contracts, re-wraps the XLM
and USDC SACs, deploys verifier → smart account → token, funds the smart account
with XLM, mints DEMO to both source wallets and the exchange, adds the USDC
trustlines, and
rewrites the derived values in `.env.local` (keeping a `.env.local.bak`). Then
`rm -rf .next && npm run dev`.

| Flag | Effect |
|------|--------|
| `--skip-build` | Reuse the wasm already in `contracts/target` |
| `--dry-run` | Deploy and fund, but print the env values instead of writing them |

The one thing it can't mint is testnet **USDC**. The G accounts get theirs from
[Circle's faucet](https://faucet.circle.com) — fund the exchange G too, or
outgoing USDC has nothing to send; the smart account holds whatever a funded G
account sends it (a contract keeps a SAC balance without a trustline).
Until an account holds USDC, its USDC option fails with the SAC's
`Error(Contract, #10)` — insufficient balance.

### How the C account authorizes a deposit

There is no admin bypass. The account's `execute(target, fn, args)` entry point
calls `require_auth()` on itself, so `/api/send` has to hand the host a signed
`AuthPayload` (`lib/smartAccount.ts`):

1. Simulate the `execute` call. The host records the account's auth entry and
   picks a nonce, but does **not** run `__check_auth`.
2. Sign `sha256(signature_payload || xdr(context_rule_ids))` — not the raw host
   payload. Binding the rule ids into the digest is what stops a signature from
   being replayed against a weaker context rule.
3. Attach the signed entry and simulate **again**. This pass really executes
   `__check_auth` and the verifier, so the resulting footprint and resource fee
   cover the whole call.

## Troubleshooting

**Sends hang / take very long in dev.** This is a dev-server (Turbopack)
problem, not the app: a corrupted `.next` cache can make `next dev` spin at
~600% CPU and starve the event loop, so every RPC round-trip crawls (the
contract path, being heaviest, looks like it hangs). Normal timings are ~1–2s
for a classic send and ~4–6s for a contract send (Soroban confirmation).

Fix:

```bash
rm -rf .next && npm run dev
```

If Turbopack still misbehaves, use the webpack dev server instead:

```bash
rm -rf .next && npm run dev:webpack
```

Always `rm -rf .next` when switching between `dev` and `dev:webpack` — mixing
their build artifacts in the same `.next` is what corrupts the cache.
