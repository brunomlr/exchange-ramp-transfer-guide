# Exchange Deposit Simulator — Implementation Plan

> On implementation, copy this file to `exchange-simulator/plan/PLAN.md` (per the
> global convention of keeping a `plan/` folder in the working project).

## Context

We want a **new, standalone app** that demonstrates and explains how a crypto
exchange detects on-chain deposits on Stellar. The current `crosswallets` app
already has the building blocks (a deployed contract account, funded testnet
keypairs, the JS SDK, muxed-account handling) but detects payments via **Horizon
effects streaming**. The new app must instead detect payments using **Stellar
RPC only (no Horizon at all)**, leveraging the **CAP-67 Unified Asset Events**
(live since Protocol 23). The educational goal is to show that a **single
event-based verification method** — reading the `transfer` event's `to_muxed_id`
— works identically across classic payments, SAC transfers, and SEP-41 token
calls, and across both classic (G) and contract (C) source accounts.

Scope for now: **deposit flow only**. The deposit/withdrawal toggle is present;
withdrawal renders a "coming soon" placeholder.

## Key technical findings (verified)

1. **RPC has no native streaming.** The "stream" is implemented by **polling
   `rpc.getEvents`** on an interval with a moving `startLedger`/cursor.
   (Source: Stellar RPC docs; skill `api-rpc-horizon.md`.)
2. **CAP-67 Unified Asset Events (Protocol 23, live).** Every asset movement —
   classic `payment` op, SAC `transfer`, or SEP-41 contract `transfer` — emits
   the **same `transfer` event** on the asset's contract:
   - **Topics:** `["transfer", from:Address, to:Address, sep0011_asset:String]`
   - **Data:** either a bare `i128 amount`, **or** an `SCVal` map
     `{ "amount": i128, "to_muxed_id": u64|bytes|string }` when the destination
     is muxed **or** the classic tx carried a memo.
   - `to_muxed_id` lives in the **data map**, not the topics.
   - For a classic **G payment with a memo id**, the **memo becomes
     `to_muxed_id`**. For a **muxed (M) destination**, the muxed id becomes
     `to_muxed_id`. → uniform across all cases.
   (Sources: CAP-0067 spec; "Announcing Protocol 23".)
3. **RPC `sendTransaction` accepts classic transactions**, not only Soroban —
   so sending can also be RPC-only (no Horizon). Poll `getTransaction` for status.
   (Source: Stellar RPC `sendTransaction` docs.)

Sources:
- https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md
- https://stellar.org/blog/developers/announcing-protocol-23
- https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/sendTransaction

## Decisions (confirmed with user)

- **Location:** sibling folder `/Users/brunomuller/projects/exchange-simulator`
  (standalone Next.js app, own `node_modules`).
- **Tokens:** XLM works out of the box (native SAC `CDLZ…`); USDC SAC, the
  G-account SEP-41 token, and the C-account custom SC token are read from env
  vars. If an env var is unset, that token option is shown **disabled** with a
  hint. **Testnet only.**
- **Sender keys:** reuse the existing app's testnet keys — the contract account
  `CBP4GFAK4GDKCMVLNIHRZPEAPT7CFYTBKICOXCVMP2FEN3QFKCRZ27KS` and the funded
  G/exchange keypair from `crosswallets/EXCHANGE_WALLET.md`. Testnet demo keys
  only.
- **UI:** shadcn/ui (the existing app uses raw Tailwind; we add shadcn fresh).

## Reused assets (from `crosswallets`)

| Asset | Value / source |
|---|---|
| Contract (C) account | `CBP4GFAK4GDKCMVLNIHRZPEAPT7CFYTBKICOXCVMP2FEN3QFKCRZ27KS` (`.env.local`) |
| Exchange G account (public) | `GDTK5AHIRDOI6VGTLMQ7YMZBU2SKBE7PWNME42R2JZ3RSCTWAX3HT7DO` (`EXCHANGE_WALLET.md`) |
| Exchange G account (secret) | `[REDACTED]` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (`lib/stellar.ts:35`) |
| RPC URL / passphrase | `https://soroban-testnet.stellar.org`, `Networks.TESTNET` |
| Code patterns to adapt | `lib/stellar.ts` (`sendPayment`, MuxedAccount parsing, stroops conversion), muxed handling in `app/components/TransferForm.tsx` & `ExchangeWallet.tsx` |

> The G account is the **sender's classic wallet** AND the deposit destination's
> base in this demo (exchange = a different role conceptually but reuses the same
> funded testnet keypair set). On implementation, use a separate funded sender G
> keypair if available; otherwise the same testnet key can play both roles since
> from≠to is still satisfied by using the contract account or a second key. **At
> implementation, confirm we have two distinct funded testnet G keys**; if not,
> generate + Friendbot-fund a second sender key and store its secret in env.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  [ Deposit ]  [ Withdrawal ]      ← top toggle (withdrawal = soon) │
├──────────────────────────────────────────────────────────────┤
│  ℹ Info box: explains the CURRENT step of the flow             │
├───────────────────────────────┬──────────────────────────────┤
│  USER WALLET (left)            │  EXCHANGE (right)             │
│  1. Account type: G | C        │  2. Deposit info (read-only): │
│  3. (G only) Muxed | G+memo    │     - G address               │
│  4. Token select + amount(=1)  │     - Memo id (e.g. 123456789)│
│  5. [ Send ] → status…         │     - Muxed (M) address       │
│                                │  6. Live RPC event stream:    │
│                                │     incoming transfers, match │
│                                │     to_muxed_id → "Detected!" │
│                                │     + technical explanation   │
└───────────────────────────────┴──────────────────────────────┘
```

### Flow steps (drives the info box copy)

1. **Select source account type** — Classic (G) or Contract (C).
2. **Exchange shows deposit info** (read-only): base G address, a fixed **memo
   id** (the deposit id, e.g. `1234566789`), and the **muxed M address** =
   `MuxedAccount(G, id).accountId()`.
3. **(G only) addressing method** — **Muxed M address** or **G address + memo
   id**. Selecting one reveals the exact destination used (read-only). For **C
   accounts, muxed is always used** (contract calls can't attach a classic memo).
4. **Token + amount** — amount prefilled `1`; token list depends on account type
   (see below).
5. **Send** — build + sign + submit via **RPC `sendTransaction`**, poll
   `getTransaction`; show status (`Building → Signing → Pending → Success`).
6. **Detection** — right-side panel continuously polls `rpc.getEvents`, lists
   incoming `transfer` events to the exchange address, and when an event's
   `to_muxed_id` equals the deposit id, flags **"Deposit detected from user"**
   with a technical breakdown.

### Token matrix

| Source | Token options | Send mechanism | Event source contract |
|---|---|---|---|
| **G (classic)** | XLM | classic `Operation.payment` (native) | XLM SAC `CDLZ…` |
| | USDC | classic `Operation.payment` (asset) — needs USDC SAC env for detection | `NEXT_PUBLIC_USDC_SAC` |
| | SEP-41 token | `InvokeHostFunction` → `token.transfer` (G source authorizes) | `NEXT_PUBLIC_SEP41_TOKEN` |
| **C (contract)** | XLM (SAC) | `token.transfer` on XLM SAC, `from = C` | XLM SAC `CDLZ…` |
| | USDC (SAC) | `token.transfer` on USDC SAC | `NEXT_PUBLIC_USDC_SAC` |
| | Custom SC token | `token.transfer` on custom token | `NEXT_PUBLIC_SC_TOKEN` |

Options whose env var is unset render disabled with a "set `<VAR>` to enable" hint.

## The core: RPC-only detection (`lib/events.ts`)

A **single verification method** for all cases:

```
poll loop (every ~3s):
  latest = await rpc.getLatestLedger()
  res = await rpc.getEvents({
    startLedger: cursorLedger,            // advance each poll; seed from latest - N
    filters: [{
      type: "contract",
      contractIds: [ ...configuredTokenSacIds ],   // XLM SAC + any env tokens (max 5)
      topics: [[ scvSymbol("transfer").toXDR("base64"), "*", "*", "*" ]],
    }],
    pagination: { cursor, limit: 100 },
  })
  for each event:
    topics = event.topic.map(scValToNative)        // ["transfer", from, to, asset]
    to      = topics[2]
    if (to !== EXCHANGE_BASE_G) continue            // only deposits to us
    data    = scValToNative(event.value)            // i128  OR  { amount, to_muxed_id }
    amount  = typeof data === "bigint" ? data : data.amount
    muxedId = (typeof data === "object") ? data.to_muxed_id : undefined
    append to incoming-list (dedupe by event.id)
    if (muxedId?.toString() === DEPOSIT_ID) → mark as "matched / detected"
  advance cursor
```

Notes:
- Use the SDK `rpc.Server.getEvents` (preferred) or raw `fetch` JSON-RPC
  `getEvents` (the existing app already uses raw `fetch` for `getLedgerEntries`,
  so either is consistent). Use the SDK form for cleaner ScVal decoding.
- `getEvents` requires a `startLedger` within the ~7-day retention window; seed
  the cursor from `getLatestLedger().sequence` on mount and only move forward.
- **Single method, all types:** because classic payments, SAC transfers, and
  SEP-41 calls all emit the same `transfer` event with `to_muxed_id`, the same
  loop handles every row. This is the central teaching point shown in the UI.

### Technical-explanation UI (right panel)

For each detected/listed event, render an expandable "How this was detected" box:
- The raw topics `["transfer", from, to, sep0011_asset]`.
- The decoded data: `amount`, and `to_muxed_id` (highlighted).
- A note: *"`to_muxed_id` carries the muxed id. For classic **G** payments that
  used a **memo** instead of a muxed address, the memo value is surfaced as the
  same `to_muxed_id` — so one check covers both."*
- The match verdict: `to_muxed_id (123…) === deposit id (123…)` → ✅ detected.

### Send/destination info message (right panel)

Compute and display a plain-English summary of what was sent, e.g.:
- "G account sent a **SEP-41 custom token** to a **Muxed address**."
- "G account sent **XLM** to a **G address with memo `123…`**."
- "Contract (C) account sent **USDC (SAC)** to a **Muxed address**."

## Send logic (`lib/send.ts`, RPC-only)

- **Destination resolution:**
  - Muxed: `new MuxedAccount(new Account(EXCHANGE_G, "0"), DEPOSIT_ID).accountId()` → M.
  - G + memo: destination = `EXCHANGE_G`, attach `Memo.id(DEPOSIT_ID)`.
- **Classic path (G + XLM/USDC):** `TransactionBuilder` with
  `Operation.payment({ destination, asset, amount })` (+ `Memo.id` when G+memo),
  sign with sender keypair, `rpc.sendTransaction`, poll `getTransaction`.
- **Contract path (C source, or G + SEP-41):** `token.transfer(from, to, amount)`
  via `new Contract(tokenId).call("transfer", …)`; `from` is the C address (or G
  for the SEP-41-from-G case); `to` is the **muxed ScAddress** (M). Build →
  `simulateTransaction`/`assembleTransaction` → sign → `sendTransaction` → poll.
  - ⚠ **Verification risk:** building a **muxed ScAddress** as the `to` argument
    requires SDK support for CAP-67 muxed addresses in contract args. Confirm the
    installed `@stellar/stellar-sdk` version supports `Address.fromString("M…")`
    / muxed ScVal; **bump the SDK to the latest 14.x (or current) if needed.**
  - For the **C source** path: *resolved* — the account is an OpenZeppelin
    smart account with no admin bypass. Its `execute` entry point is authorized
    by a signed `AuthPayload` from its one ed25519 signer (see README, "How the C
    account authorizes a deposit", and `lib/smartAccount.ts`).
- Amount → stroops: `Math.floor(parseFloat(amount) * 1e7)` for 7-decimal tokens.

## File / project structure

```
exchange-simulator/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # toggle + info box + two-column layout
│   └── globals.css
├── components/
│   ├── ui/                      # shadcn components (button, card, select, tabs, badge, input, alert…)
│   ├── DepositFlow.tsx          # orchestrates steps + shared state
│   ├── UserWallet.tsx           # left: account type, addressing, token, amount, send
│   ├── ExchangePanel.tsx        # right: deposit info (read-only)
│   ├── EventStream.tsx          # right: live RPC getEvents polling + detection + tech explainer
│   ├── InfoBox.tsx              # step-aware explanatory copy
│   └── FlowToggle.tsx           # Deposit | Withdrawal (withdrawal = "coming soon")
├── lib/
│   ├── stellar.ts               # RPC server, passphrase, SAC const, MuxedAccount/stroops helpers (adapted from crosswallets, RPC-only)
│   ├── events.ts                # getEvents polling + transfer/to_muxed_id parsing
│   ├── send.ts                  # classic + contract send via RPC sendTransaction
│   └── tokens.ts                # token registry keyed by account type, env-driven
├── plan/PLAN.md                 # copy of this plan
├── components.json              # shadcn config
├── tailwind.config.js / postcss.config.mjs
├── tsconfig.json                # @/* path alias
├── .env.local
└── package.json
```

### Env vars (`.env.local`)

```
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_EXCHANGE_G=GDTK5AHIRDOI6VGTLMQ7YMZBU2SKBE7PWNME42R2JZ3RSCTWAX3HT7DO
NEXT_PUBLIC_USER_CONTRACT_C=CBP4GFAK4GDKCMVLNIHRZPEAPT7CFYTBKICOXCVMP2FEN3QFKCRZ27KS
NEXT_PUBLIC_DEPOSIT_ID=1234566789
NEXT_PUBLIC_XLM_SAC=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
# Optional — token options disabled until set:
NEXT_PUBLIC_USDC_SAC=
NEXT_PUBLIC_SEP41_TOKEN=
NEXT_PUBLIC_SC_TOKEN=
# Sender secrets (testnet demo only — keep server-side if possible):
SENDER_G_SECRET=[REDACTED]
```

> ⚠ Secrets in `NEXT_PUBLIC_*` ship to the browser. For a testnet demo this
> mirrors the existing app's approach, but prefer a small Next.js **route
> handler** (`app/api/send/route.ts`) that signs server-side using
> `SENDER_G_SECRET` (no `NEXT_PUBLIC_`). Decide at implementation; default to the
> server route to avoid leaking secrets and to keep client code RPC-read-only.

## Implementation steps

1. **Scaffold** `exchange-simulator` as a standalone Next.js 15 + TS + Tailwind
   app (npm, App Router, `@/*` alias). Copy `plan/PLAN.md`.
2. **Add shadcn/ui** (`npx shadcn@latest init`) and the components: `button`,
   `card`, `select`, `tabs`, `badge`, `input`, `alert`, `separator`, `tooltip`.
3. **`lib/stellar.ts`** — RPC `Server`, passphrase, SAC const, `toMuxed(g,id)`,
   `toStroops`/`fromStroops` (adapt from `crosswallets/lib/stellar.ts`).
4. **`lib/tokens.ts`** — token registry per account type, reading env; expose
   `enabled` flag + the SAC/contract id used for both sending and event filtering.
5. **`lib/events.ts`** — `getEvents` polling loop + `parseTransferEvent` →
   `{ from, to, asset, amount, toMuxedId, eventId, ledger }`; dedupe + match.
6. **`lib/send.ts`** (or `app/api/send/route.ts`) — classic + contract send via
   RPC, status polling.
7. **UI**: `FlowToggle`, `InfoBox`, `UserWallet`, `ExchangePanel`, `EventStream`,
   composed in `DepositFlow` / `page.tsx`. Wire shared state (deposit id, account
   type, addressing method, token, send status) with React hooks (match existing
   app: hooks only, no state lib).
8. **Withdrawal**: toggle renders a "coming soon" placeholder.
9. **`.env.local`** with reused addresses/keys; `.env.example` with blanks.

## Verification (end-to-end on testnet)

1. `npm run dev`; open the app — Deposit tab active, info box on step 1.
2. Confirm the **event stream panel starts polling** (RPC `getEvents`) and shows
   a "listening" state with the current ledger advancing.
3. **G + XLM + Muxed:** keep amount `1`, send. Watch status reach `Success`,
   then within a few seconds the right panel lists the incoming `transfer` event,
   shows `to_muxed_id === 1234566789`, and flags **Deposit detected**. Expand the
   tech box and confirm topics/data render correctly.
4. **G + XLM + G address + memo:** send; confirm the same panel detects it and
   that `to_muxed_id` carries the **memo** (proving the single-method claim).
5. **C + XLM (SAC) + Muxed:** send from the contract account; confirm detection
   via the identical loop. (If muxed-ScAddress send fails, bump the SDK and
   retry — see verification risk above.)
6. If `NEXT_PUBLIC_SEP41_TOKEN` / `NEXT_PUBLIC_USDC_SAC` / `NEXT_PUBLIC_SC_TOKEN`
   are set, repeat for those and confirm detection is unchanged.
7. Confirm **no Horizon** calls exist anywhere (grep for `Horizon`,
   `horizon-testnet`) — only `rpc.Server` / JSON-RPC.
8. Cross-check a detected tx hash on stellar.expert (testnet) to confirm the
   on-chain payment matches what the UI reported.

## Open risks / to confirm during implementation

- **SDK muxed-ScAddress support** for contract `transfer` `to` arg (bump SDK if
  needed). Highest-uncertainty item.
- **Two distinct funded testnet G keys** (sender vs exchange) — generate +
  Friendbot-fund a second if only one exists.
- ~~**C-account `transfer` auth path**~~ — resolved: signed `AuthPayload` via
  the OpenZeppelin smart account's `execute`, no admin path.
- **Testnet is Protocol ≥23** so unified events are emitted (it is, as of now;
  verify via `getLatestLedger().protocolVersion`).
