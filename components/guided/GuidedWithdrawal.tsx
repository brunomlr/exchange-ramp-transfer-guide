"use client";

import { useEffect, useState } from "react";
import {
  Wallet,
  Landmark,
  Loader2,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  Pencil,
  RotateCcw,
  FileCode2,
  Code2,
  ChevronDown,
  Boxes,
  Badge as BadgeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AddressChip } from "@/components/AddressChip";
import { DocLink } from "@/components/DocLink";
import { AccordionStep, type StepState } from "@/components/guided/AccordionStep";
import { FundsFlowSummary } from "@/components/guided/FundsFlowSummary";
import { Highlight, themes } from "prism-react-renderer";
import { cn } from "@/lib/utils";
import {
  EXCHANGE_G,
  USER_G,
  USER_CONTRACT_C,
  shorten,
  toStroops,
  explorerTxUrl,
  explorerAccountUrl,
  explorerContractUrl,
} from "@/lib/stellar";
import { getWithdrawalTokens, type AccountType } from "@/lib/tokens";
import type { SendStatus, WithdrawalSentInfo } from "@/lib/flow";

/** Default withdrawal amount for the demo. */
const DEFAULT_AMOUNT = "1";

/** localStorage key for resuming the guided withdrawal across refreshes. */
const STORAGE_KEY = "guided-withdrawal-state-v1";

export function GuidedWithdrawal() {
  // Step 1
  const [destType, setDestType] = useState<AccountType | null>(null);
  const [tokenKey, setTokenKey] = useState("");
  // Step 2
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  // Step 3
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<WithdrawalSentInfo | null>(null);

  // Committed snapshots — used to detect a revisit-and-change.
  const [committed1, setCommitted1] = useState<{
    destType: AccountType;
    tokenKey: string;
  } | null>(null);
  const [committed2, setCommitted2] = useState<{ amount: string } | null>(null);

  const [openStep, setOpenStep] = useState(1);

  // ---- persistence: resume the wizard across refreshes ----
  const [ready, setReady] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       one-time hydration from localStorage on mount; a lazy useState
       initializer would read storage during SSR and break hydration. */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.destType) setDestType(s.destType);
        if (typeof s.tokenKey === "string") setTokenKey(s.tokenKey);
        if (typeof s.amount === "string") setAmount(s.amount);
        // A send that was in-flight when the tab closed can't be resumed.
        setSendStatus(s.sendStatus === "success" ? "success" : "idle");
        if (s.sentInfo) setSentInfo(s.sentInfo);
        if (s.committed1) setCommitted1(s.committed1);
        if (s.committed2) setCommitted2(s.committed2);
        if (typeof s.openStep === "number") setOpenStep(s.openStep);
      }
    } catch {
      /* ignore corrupt / unavailable storage */
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          destType,
          tokenKey,
          amount,
          sendStatus: sendStatus === "sending" ? "idle" : sendStatus,
          sentInfo,
          committed1,
          committed2,
          openStep,
        })
      );
    } catch {
      /* ignore quota / unavailable storage */
    }
  }, [
    ready,
    destType,
    tokenKey,
    amount,
    sendStatus,
    sentInfo,
    committed1,
    committed2,
    openStep,
  ]);

  function startOver() {
    setDestType(null);
    setTokenKey("");
    setAmount(DEFAULT_AMOUNT);
    setSendStatus("idle");
    setSendError(null);
    setSentInfo(null);
    setCommitted1(null);
    setCommitted2(null);
    setOpenStep(1);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  // ---- derived ----
  const tokens = destType ? getWithdrawalTokens(destType) : [];
  const selectedToken = tokens.find((t) => t.key === tokenKey);
  const destAddr = destType === "C" ? USER_CONTRACT_C : USER_G;

  const step1Done = !!committed1;
  const step2Done = !!committed2;
  const step3Done = sendStatus === "success" && !!sentInfo;

  const step1Changed =
    !!committed1 &&
    (committed1.destType !== destType || committed1.tokenKey !== tokenKey);
  const step2Changed = !!committed2 && committed2.amount !== amount;

  // ---- resets ----
  function resetSend() {
    setSendStatus("idle");
    setSendError(null);
    setSentInfo(null);
  }
  function clearFrom2() {
    setCommitted2(null);
    setAmount(DEFAULT_AMOUNT);
    resetSend();
  }

  // ---- step 1 ----
  function pickDest(t: AccountType) {
    setDestType(t);
    const first = getWithdrawalTokens(t).find((x) => x.enabled);
    setTokenKey(first?.key ?? "");
  }
  const canConfirm1 = !!destType && !!selectedToken?.enabled && !!destAddr;
  function confirmStep1() {
    if (!canConfirm1 || !destType) return;
    if (step1Changed) clearFrom2();
    setCommitted1({ destType, tokenKey });
    setOpenStep(2);
  }

  // ---- step 2 ----
  const amountValid = Number(amount) > 0;
  function confirmStep2() {
    if (!amountValid) return;
    if (step2Changed) resetSend();
    setCommitted2({ amount });
    setOpenStep(3);
  }

  // ---- step 3 ----
  const canSend = step1Done && step2Done && amountValid && sendStatus !== "sending";

  async function onSend() {
    if (!canSend) return;
    setSendStatus("sending");
    setSendError(null);
    setSentInfo(null);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destType, tokenKey, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");
      setSentInfo(data as WithdrawalSentInfo);
      setSendStatus("success");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Withdrawal failed");
      setSendStatus("error");
    }
  }

  // ---- accordion helpers ----
  function canOpen(n: number) {
    if (n === 1) return true;
    if (n === 2) return step1Done;
    return step1Done && step2Done; // step 3
  }
  function stateOf(n: number, done: boolean): StepState {
    if (openStep === n) return "active";
    if (done) return "done";
    return "upcoming";
  }
  function toggle(n: number) {
    if (!canOpen(n)) return;
    setOpenStep((cur) => (cur === n ? 0 : n));
  }

  const mechanism = selectedToken?.mechanism;

  return (
    <div className="space-y-3">
      {/* Summary — which way the funds move in this flow */}
      <FundsFlowSummary direction="withdrawal" />

      {/* Source: always the exchange's hot G account */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <Landmark className="size-3.5" /> Source · exchange hot wallet (G)
        </div>
        <AddressChip
          value={EXCHANGE_G || "— NEXT_PUBLIC_EXCHANGE_G not set —"}
          href={EXCHANGE_G ? explorerAccountUrl(EXCHANGE_G) : undefined}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Every withdrawal is signed by and sent from the exchange&apos;s Classic
          (G) account. Only the destination and token change.
        </p>
      </div>

      {/* STEP 1 — Destination & token */}
      <AccordionStep
        index={1}
        title="Destination & token"
        state={stateOf(1, step1Done)}
        open={openStep === 1}
        onToggle={() => toggle(1)}
        summary={
          step1Done &&
          committed1 && (
            <>
              {committed1.destType === "G"
                ? "Classic Account (G address)"
                : "Contract Account (C address)"}{" "}
              ·{" "}
              {getWithdrawalTokens(committed1.destType).find(
                (t) => t.key === committed1.tokenKey
              )?.label}
            </>
          )
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Choose where the funds go and which token to send. The destination type
          decides how the transaction is built: a{" "}
          <strong>Classic Account (G address)</strong> can take a native payment,
          while a <strong>Contract Account (C address)</strong> can only be
          reached through a <DocLink doc="sep41">token contract</DocLink>&apos;s{" "}
          <code className="font-mono">transfer</code>.
        </p>

        <Label className="mb-1.5 block text-sm font-semibold text-foreground">
          Destination account
        </Label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <RadioCard
            active={destType === "G"}
            disabled={!USER_G}
            onClick={() => pickDest("G")}
            title="Classic Account (G address)"
            subtitle="takes native payment"
            icon={<Wallet className="size-4" />}
          />
          <RadioCard
            active={destType === "C"}
            disabled={!USER_CONTRACT_C}
            onClick={() => pickDest("C")}
            title="Contract Account (C address)"
            subtitle="token transfer only"
            icon={<Boxes className="size-4" />}
          />
        </div>

        {destType && (
          <>
            <Label className="mb-1.5 block text-sm font-semibold text-foreground">
              Token
            </Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {tokens.map((t) => (
                <RadioCard
                  key={t.key}
                  active={tokenKey === t.key}
                  disabled={!t.enabled}
                  onClick={() => setTokenKey(t.key)}
                  title={t.label}
                  subtitle={t.enabled ? t.symbol : "set env"}
                />
              ))}
            </div>
            {selectedToken && (
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedToken.note}
              </p>
            )}
            <Label className="mt-3 mb-1.5 block text-sm font-semibold text-foreground">
              Destination address
            </Label>
            <AddressChip
              value={destAddr || "— not configured —"}
              href={
                destAddr
                  ? destType === "C"
                    ? explorerContractUrl(destAddr)
                    : explorerAccountUrl(destAddr)
                  : undefined
              }
            />
          </>
        )}

        <StepAction
          changed={!!step1Changed}
          committed={step1Done}
          disabled={!canConfirm1}
          onClick={confirmStep1}
        />
      </AccordionStep>

      {/* STEP 2 — Build the transaction */}
      <AccordionStep
        index={2}
        title="Build the transaction"
        state={stateOf(2, step2Done)}
        locked={!canOpen(2)}
        open={openStep === 2}
        onToggle={() => toggle(2)}
        summary={
          step2Done && committed2 ? (
            <>
              {committed2.amount} {selectedToken?.symbol} ·{" "}
              {mechanism === "classic-native"
                ? "classic payment"
                : "contract transfer"}
            </>
          ) : undefined
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Set the amount, then see exactly how the exchange constructs and signs
          this transaction for the chosen model.
        </p>

        <Label className="mb-1.5 block text-sm font-semibold text-foreground">
          Amount ({selectedToken?.symbol})
        </Label>
        <Input
          type="number"
          min="0"
          step="0.0000001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-40"
        />

        {selectedToken && destType && (
          <BuildExplainer
            destType={destType}
            tokenSymbol={selectedToken.symbol}
            mechanism={selectedToken.mechanism}
            amount={amountValid ? amount : "amount"}
          />
        )}

        <StepAction
          changed={!!step2Changed}
          committed={step2Done}
          disabled={!amountValid}
          onClick={confirmStep2}
        />
      </AccordionStep>

      {/* STEP 3 — Send & confirm */}
      <AccordionStep
        index={3}
        title="Send & confirm"
        state={stateOf(3, step3Done)}
        locked={!canOpen(3)}
        open={openStep === 3}
        onToggle={() => toggle(3)}
        summary={
          step3Done && sentInfo ? (
            <span className="text-emerald-600">
              sent {amount} {selectedToken?.symbol}
            </span>
          ) : step2Done ? (
            "ready to send"
          ) : undefined
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Submit the transaction to the network. Once it confirms, the same{" "}
          <DocLink doc="cap67"><strong>CAP-67 unified transfer event</strong></DocLink>{" "}
          shows up on the asset contract — the exact signal a watcher (or the
          receiving user) reads.
        </p>

        {selectedToken && destType && (
          <TxCodeSnippet
            destType={destType}
            tokenKey={tokenKey}
            tokenSymbol={selectedToken.symbol}
            mechanism={selectedToken.mechanism}
            amount={amountValid ? amount : "1"}
          />
        )}

        <Button onClick={onSend} disabled={!canSend} className="w-full">
          {sendStatus === "sending" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Sending…
            </>
          ) : sendStatus === "success" ? (
            <>
              Send again <ArrowRight className="size-4" />
            </>
          ) : (
            <>
              Send withdrawal <ArrowUpFromLine className="size-4" />
            </>
          )}
        </Button>

        {sendStatus === "error" && sendError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Withdrawal failed</AlertTitle>
            <AlertDescription className="break-all">{sendError}</AlertDescription>
          </Alert>
        )}

        {sendStatus === "success" && sentInfo && (
          <WithdrawalResult info={sentInfo} />
        )}
      </AccordionStep>

      {destType && (
        <div className="flex justify-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={startOver}
            className="text-muted-foreground"
          >
            <RotateCcw className="size-3.5" /> Start over
          </Button>
        </div>
      )}
    </div>
  );
}

/** Explains how the tx is built and sent for the selected destination + token. */
function BuildExplainer({
  destType,
  tokenSymbol,
  mechanism,
  amount,
}: {
  destType: AccountType;
  tokenSymbol: string;
  mechanism: string;
  amount: string;
}) {
  const isClassic = mechanism === "classic-native";
  const op = isClassic ? "payment" : "invokeHostFunction";
  const pseudo = isClassic
    ? `Operation.payment({
  destination: USER_G,        // a Classic (G) address
  asset: Asset.native(),      // XLM
  amount: "${amount}",
})`
    : `// ${tokenSymbol} contract
contract.call(
  "transfer",
  from: EXCHANGE_G,           // the exchange's own G account
  to:   ${destType === "C" ? "USER_CONTRACT_C" : "USER_G"},${
        destType === "C" ? "      // a Contract (C) address" : "                // a Classic (G) address"
      }
  amount: ${amount},
)`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 font-mono text-[10px]">
          <FileCode2 className="size-3" /> {op}
        </Badge>
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <BadgeIcon className="size-3" />
          {isClassic ? "classic-native" : "contract-transfer"}
        </Badge>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it&apos;s built
        </p>
        <ol className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          {buildNarrative(destType, tokenSymbol, isClassic).map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/50" />
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </div>

      <pre className="overflow-x-auto rounded-lg border bg-background p-3 font-mono text-[11px] leading-relaxed">
        {pseudo}
      </pre>
    </div>
  );
}

function buildNarrative(
  destType: AccountType,
  tokenSymbol: string,
  isClassic: boolean
): React.ReactNode[] {
  const lines: React.ReactNode[] = [];

  if (isClassic) {
    lines.push(
      <>
        The exchange builds a single <strong>classic payment operation</strong>{" "}
        on its G account: <code className="font-mono">from</code> the exchange G,{" "}
        <code className="font-mono">to</code> the user&apos;s G address, moving
        native XLM. No contract call is involved.
      </>
    );
    lines.push(
      <>
        It signs with the exchange&apos;s key and submits over{" "}
        <DocLink doc="rpc">RPC</DocLink> with{" "}
        <DocLink doc="sendTransaction" code>sendTransaction</DocLink> — no{" "}
        <code className="font-mono">prepareTransaction</code> needed, since
        there&apos;s no <DocLink doc="soroban">Soroban</DocLink> footprint to compute.
      </>
    );
  } else {
    if (destType === "C") {
      lines.push(
        <>
          A <strong>Contract (C) address can&apos;t receive a classic payment</strong>
          , so even XLM moves through the asset&apos;s{" "}
          <DocLink doc="sac">token contract</DocLink>. The
          exchange invokes <code className="font-mono">transfer</code> with{" "}
          <code className="font-mono">to</code> = the user&apos;s C address.
        </>
      );
    } else {
      lines.push(
        <>
          The exchange invokes the {tokenSymbol} contract&apos;s{" "}
          <code className="font-mono">transfer</code> with{" "}
          <code className="font-mono">from</code> = its own G account and{" "}
          <code className="font-mono">to</code> = the user&apos;s G address.
        </>
      );
    }
    lines.push(
      <>
        Because the exchange G account is <strong>both the transaction source
        and the <code className="font-mono">from</code></strong>, its signature
        satisfies the{" "}
        <DocLink doc="requireAuth" code>require_auth</DocLink> on the
        transfer — no extra authorization entry.
      </>
    );
    lines.push(
      <>
        The tx is run through <code className="font-mono">prepareTransaction</code>{" "}
        (to compute the <DocLink doc="soroban">Soroban</DocLink> footprint and
        resource fee), then signed and submitted over{" "}
        <DocLink doc="rpc">RPC</DocLink>.
      </>
    );
  }

  lines.push(
    <>
      Once it lands, the asset contract emits a{" "}
      <DocLink doc="cap67"><strong>CAP-67 unified transfer event</strong></DocLink>{" "}
      — topics{" "}
      <code className="font-mono">[&quot;transfer&quot;, from, to, asset]</code>{" "}
      with the amount in the data — identical in shape across all three models.
    </>
  );

  return lines;
}

/** Maps a withdrawal token key to the env-derived contract constant name. */
const TOKEN_CONST: Record<string, string> = {
  xlm: "XLM_SAC",
  usdc: "USDC_SAC",
  sep41: "SEP41_TOKEN",
};

/** The real @stellar/stellar-sdk code that builds + submits THIS withdrawal. */
function txCode(
  destType: AccountType,
  tokenKey: string,
  mechanism: string,
  amount: string
): string {
  const dest = destType === "C" ? "USER_CONTRACT_C" : "USER_G";

  if (mechanism === "classic-native") {
    return `import * as StellarSdk from "@stellar/stellar-sdk";

const server = new StellarSdk.rpc.Server(RPC_URL);
const source = await server.getAccount(EXCHANGE_G);

// Classic XLM payment: exchange G account -> user G address
const tx = new StellarSdk.TransactionBuilder(source, {
  fee: StellarSdk.BASE_FEE,
  networkPassphrase: StellarSdk.Networks.TESTNET,
})
  .addOperation(
    StellarSdk.Operation.payment({
      destination: ${dest},
      asset: StellarSdk.Asset.native(),
      amount: "${amount}",
    })
  )
  .setTimeout(120)
  .build();

tx.sign(exchangeKeypair);
const sent = await server.sendTransaction(tx); // -> { status: "PENDING", hash }`;
  }

  const tokenConst = TOKEN_CONST[tokenKey] ?? "TOKEN_CONTRACT";
  const stroops = toStroops(Number(amount) > 0 ? amount : "0").toString();
  return `import * as StellarSdk from "@stellar/stellar-sdk";

const server = new StellarSdk.rpc.Server(RPC_URL);
const source = await server.getAccount(EXCHANGE_G);

// Token transfer: exchange G account invokes transfer(from, to, amount)
const contract = new StellarSdk.Contract(${tokenConst});
let tx = new StellarSdk.TransactionBuilder(source, {
  // Inclusion fee ceiling (0.2 XLM). prepareTransaction() adds the Soroban
  // resource fee on top — set high so the call isn't priced out; you pay only what's used.
  fee: "2000000",
  networkPassphrase: StellarSdk.Networks.TESTNET,
})
  .addOperation(
    contract.call(
      "transfer",
      StellarSdk.Address.fromString(EXCHANGE_G).toScVal(),  // from
      StellarSdk.Address.fromString(${dest}).toScVal(),${
        dest === "USER_G" ? "       " : ""
      } // to${destType === "C" ? " (a C address)" : ""}
      StellarSdk.nativeToScVal(${stroops}n, { type: "i128" }),
    )
  )
  .setTimeout(120)
  .build();

// Soroban op: simulate to attach the footprint + resource fee, then sign & submit
tx = await server.prepareTransaction(tx);
tx.sign(exchangeKeypair);
const sent = await server.sendTransaction(tx); // -> { status: "PENDING", hash }`;
}

/** Collapsed, expandable view of the actual SDK code for this transaction. */
function TxCodeSnippet({
  destType,
  tokenKey,
  tokenSymbol,
  mechanism,
  amount,
}: {
  destType: AccountType;
  tokenKey: string;
  tokenSymbol: string;
  mechanism: string;
  amount: string;
}) {
  const [open, setOpen] = useState(true);
  const code = txCode(destType, tokenKey, mechanism, amount);
  const label =
    mechanism === "classic-native"
      ? `classic payment · ${tokenSymbol}`
      : `contract transfer · ${tokenSymbol}`;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
      >
        <Code2 className="size-3.5 text-primary" />
        <span className="font-medium">SDK code for this transaction</span>
        <span className="text-muted-foreground">· {label}</span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <Highlight theme={themes.nightOwl} code={code} language="tsx">
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={cn(
                "overflow-x-auto border-t p-3 text-[11px] leading-relaxed",
                className
              )}
              style={style}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      )}
    </div>
  );
}

/** Result panel: tx hash, explorer link, and the emitted CAP-67 event. */
function WithdrawalResult({ info }: { info: WithdrawalSentInfo }) {
  return (
    <div className="mt-3 space-y-3">
      <Alert>
        <CheckCircle2 className="size-4 text-emerald-600" />
        <AlertTitle>Sent to the network</AlertTitle>
        <AlertDescription>
          <span>{info.summary}</span>
          <a
            href={explorerTxUrl(info.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block font-mono text-xs text-primary hover:underline"
          >
            {info.hash.slice(0, 16)}… ↗
          </a>
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border p-3 text-xs">
        <div className="mb-1.5 flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">
            CAP-67 transfer event
          </Badge>
          {info.event ? (
            <span className="font-mono font-medium">
              {info.event.amountDisplay} {assetSymbol(info.event.asset)}
            </span>
          ) : (
            <span className="text-muted-foreground">not indexed yet</span>
          )}
        </div>

        {info.event ? (
          <>
            <KV k="topics">
              [&quot;transfer&quot;, {shorten(info.event.from)},{" "}
              {shorten(info.event.to)}
              {info.event.asset && info.event.asset !== info.event.to
                ? `, "${info.event.asset}"`
                : ""}
              ]
            </KV>
            <KV k="data">
              <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed">
                {info.event.dataRaw}
              </pre>
            </KV>
            <KV k="note">
              <span className="text-muted-foreground">
                No <code className="font-mono">to_muxed_id</code> — the
                withdrawal went to a plain address, so the data is just the
                amount.
              </span>
            </KV>
          </>
        ) : (
          <p className="text-muted-foreground">
            The transaction confirmed, but the event index hasn&apos;t caught up
            yet. Open it on the explorer to see the emitted{" "}
            <code className="font-mono">transfer</code> event.
          </p>
        )}

        <a
          href={explorerTxUrl(info.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-mono text-primary hover:underline"
        >
          {shorten(info.hash, 10, 10)} ↗
        </a>
      </div>
    </div>
  );
}

function StepAction({
  changed,
  committed,
  disabled,
  onClick,
}: {
  changed: boolean;
  committed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick} disabled={disabled} className="mt-4 w-full">
      {changed ? (
        <>
          <Pencil className="size-4" /> Update transaction
        </>
      ) : committed ? (
        <>
          Continue <ArrowRight className="size-4" />
        </>
      ) : (
        <>
          Next <ArrowRight className="size-4" />
        </>
      )}
    </Button>
  );
}

function RadioCard({
  active,
  disabled,
  onClick,
  title,
  subtitle,
  icon,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {icon && <span className="text-primary">{icon}</span>}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="mt-1">
      <span className="font-medium text-muted-foreground">{k}:</span>{" "}
      <span className="font-mono break-all">{children}</span>
    </div>
  );
}

function assetSymbol(sep11: string): string {
  if (sep11 === "native") return "XLM";
  return sep11.split(":")[0] || sep11;
}
