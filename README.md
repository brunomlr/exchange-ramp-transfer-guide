# Exchange Deposit Simulator

A Stellar testnet demo that simulates depositing to an exchange and **detecting
the payment in real time using Stellar RPC only — no Horizon**.

It demonstrates the **CAP-67 unified asset events** (live since Protocol 23): a
classic `payment`, a SAC `transfer`, and a SEP-41 contract `transfer` all emit
the *same* `transfer` event on the asset's contract, carrying `to_muxed_id` in
the data. So a **single check** — read `to_muxed_id`, compare to the exchange's
deposit id — identifies the depositing user across every token type and across
both Classic (G) and Contract (C) source accounts.

## How it works

- **Left — user wallet:** choose a source (Classic `G` or Contract `C`),
  addressing (muxed `M` address, or `G` address + memo for classic XLM), a token,
  and an amount (prefilled `1`).
- **Right — exchange:** shows the read-only deposit details (base `G` address,
  deposit id / memo id, and the combined muxed `M` address).
- **Send** builds, signs (server-side, in `app/api/send`), and submits via
  `rpc.sendTransaction` — classic and contract transactions alike.
- **Live deposit detection** polls `rpc.getEvents` for `transfer` events on the
  configured token contracts and matches `to_muxed_id` against the deposit id.
  Each row has a "how it was detected" breakdown (raw topics + data + the match
  check). For a classic `G` payment that used a **memo**, the memo arrives as the
  same `to_muxed_id`.

Only the **deposit** flow is implemented; the Withdrawal tab is a placeholder.

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
| `NEXT_PUBLIC_USER_CONTRACT_C` | User's contract account (sender) |
| `NEXT_PUBLIC_XLM_SAC` | Native XLM Stellar Asset Contract |
| `NEXT_PUBLIC_USDC_SAC` / `NEXT_PUBLIC_SEP41_TOKEN` / `NEXT_PUBLIC_SC_TOKEN` | Optional tokens — each enables its option when set |
| `USER_G_SECRET` / `CONTRACT_ADMIN_SECRET` | **Server-side only** signing secrets |

### Contract account setup

The C-account source is a redeployed `passkey-account` smart wallet driven via
`execute_as_admin` (a plain ed25519 admin keypair — no passkey needed for the
demo). To redeploy on a fresh testnet:

```bash
stellar contract deploy \
  --wasm <path>/passkey_account.optimized.wasm \
  --source-account <ADMIN_SECRET> --network testnet
# then initialize + fund the contract:
CONTRACT_ID=<deployed C...> ADMIN_SECRET=<S...> node scripts/setup-contract.mjs
```

Set the resulting contract id as `NEXT_PUBLIC_USER_CONTRACT_C`.

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
