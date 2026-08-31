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
  Hash,
  Tag,
  Ban,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AddressChip } from "@/components/AddressChip";
import { DocLink } from "@/components/DocLink";
import { AccordionStep, type StepState } from "@/components/guided/AccordionStep";
import { FundsFlowSummary } from "@/components/guided/FundsFlowSummary";
import { RadioCard } from "@/components/guided/RadioCard";
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
import { assetTicker, formatTopics } from "@/lib/events";
import { getWithdrawalTokens, type AccountType } from "@/lib/tokens";
import type {
  SendStatus,
  WithdrawalSentInfo,
  WithdrawalIdMethod,
} from "@/lib/flow";

/** Default routing id used when the user opts into a memo / muxed id. */
const DEFAULT_ID = "123456";

/**
 * Which routing-id methods are valid for a given destination + mechanism.
 * - Muxed folds a 64-bit id into the *address*, so it only works for an
 *   account (G) destination — a contract (C) address can't be muxed.
 * - Memo only becomes the on-chain `to_muxed_id` on a *classic* payment; on a
 *   Soroban transfer the id has to ride in the muxed `to` (or call args).
 */
function idAvailability(
  destType: AccountType | null,
  mechanism: string | undefined
) {
  return {
    muxed: destType === "G",
    memo: destType === "G" && mechanism === "classic-native",
  };
}

/** Snap a chosen id method back to something valid for the current rails. */
function normalizeIdMethod(
  method: WithdrawalIdMethod,
  avail: { muxed: boolean; memo: boolean }
): WithdrawalIdMethod {
  if (method === "muxed" && !avail.muxed) return "none";
  if (method === "memo" && !avail.memo) return avail.muxed ? "muxed" : "none";
  return method;
}

/** Default withdrawal amount for the demo. */
const DEFAULT_AMOUNT = "1";

/** localStorage key for resuming the guided withdrawal across refreshes. */
const STORAGE_KEY = "guided-outgoing-state-v1";

export function GuidedOutgoing() {
  // Step 1
  const [destType, setDestType] = useState<AccountType | null>(null);
  const [tokenKey, setTokenKey] = useState("");
  // Step 2
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [idMethod, setIdMethod] = useState<WithdrawalIdMethod>("none");
  const [idValue, setIdValue] = useState(DEFAULT_ID);
  // Step 3
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<WithdrawalSentInfo | null>(null);

  // Committed snapshots — used to detect a revisit-and-change.
  const [committed1, setCommitted1] = useState<{
    destType: AccountType;
    tokenKey: string;
  } | null>(null);
  const [committed2, setCommitted2] = useState<{
    amount: string;
    idMethod: WithdrawalIdMethod;
    idValue: string;
  } | null>(null);

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
        if (s.idMethod === "muxed" || s.idMethod === "memo" || s.idMethod === "none")
          setIdMethod(s.idMethod);
        if (typeof s.idValue === "string") setIdValue(s.idValue);
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
          idMethod,
          idValue,
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
    idMethod,
    idValue,
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
    setIdMethod("none");
    setIdValue(DEFAULT_ID);
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
  const step2Changed =
    !!committed2 &&
    (committed2.amount !== amount ||
      committed2.idMethod !== idMethod ||
      committed2.idValue !== idValue);

  // Effective (committed) values — these, not the live inputs, drive every
  // downstream "next-steps" display (the build explainer, the SDK snippet) and
  // the actual send. So revisiting a step and changing a selection never alters
  // what's shown for later steps until the user clicks the step's button to
  // re-commit. Before a step's first commit there's no snapshot yet, so we fall
  // back to the live draft — the build preview while the button still reads
  // "Next".
  const effDestType = committed1?.destType ?? destType;
  const effTokenKey = committed1?.tokenKey ?? tokenKey;
  const effTokens = effDestType ? getWithdrawalTokens(effDestType) : [];
  const effToken = effTokens.find((t) => t.key === effTokenKey);
  const effMechanism = effToken?.mechanism;
  const effAmount = committed2?.amount ?? amount;
  const effIdMethod = committed2?.idMethod ?? idMethod;
  const effIdValue = committed2?.idValue ?? idValue;
  const effAmountValid = Number(effAmount) > 0;
  const effIdValid = effIdMethod === "none" || /^\d+$/.test(effIdValue);

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
    // Default to the first id option ("none"). The user can switch to muxed/memo.
    setIdMethod("none");
  }
  function pickToken(key: string) {
    setTokenKey(key);
    const tok = tokens.find((t) => t.key === key);
    const avail = idAvailability(destType, tok?.mechanism);
    setIdMethod((m) => normalizeIdMethod(m, avail));
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
  const idAvail = idAvailability(effDestType, effMechanism);
  const idValid = idMethod === "none" || /^\d+$/.test(idValue);
  const canConfirm2 = amountValid && idValid;
  function confirmStep2() {
    if (!canConfirm2) return;
    if (step2Changed) resetSend();
    setCommitted2({ amount, idMethod, idValue });
    setOpenStep(3);
  }

  // ---- step 3 ----
  const canSend =
    step1Done && step2Done && effAmountValid && effIdValid && sendStatus !== "sending";

  async function onSend() {
    if (!canSend) return;
    setSendStatus("sending");
    setSendError(null);
    setSentInfo(null);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destType: effDestType,
          tokenKey: effTokenKey,
          amount: effAmount,
          idMethod: effIdMethod,
          idValue: effIdValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transfer failed");
      setSentInfo(data as WithdrawalSentInfo);
      setSendStatus("success");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Transfer failed");
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

  return (
    <div className="flow-outgoing space-y-3">
      {/* Summary — which way the funds move in this flow */}
      <FundsFlowSummary direction="outgoing" />

      {/* Source: always the exchange's hot G account */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="type-eyebrow mb-1.5 flex items-center gap-2 text-primary">
          <Landmark className="size-3.5" /> Source · exchange hot wallet (G)
        </div>
        <AddressChip
          value={EXCHANGE_G || "— NEXT_PUBLIC_EXCHANGE_G not set —"}
          href={EXCHANGE_G ? explorerAccountUrl(EXCHANGE_G) : undefined}
        />
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Every outgoing transfer is signed by and sent from the ramp/exchange’s
          Classic (G) account. Only the destination and token change.
        </p>
      </div>

      {/* STEP 1 — Destination & token */}
      <AccordionStep
        index={1}
        accent="blue"
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
          reached through a <DocLink doc="sep41">token contract</DocLink>’s{" "}
          <code className="font-mono">transfer</code>.
        </p>

        <Label className="mb-1.5 block text-foreground">
          Destination account
        </Label>
        <RadioGroup
          value={destType ?? ""}
          onValueChange={(value) => pickDest(value as AccountType)}
          aria-label="Destination account"
          className="mb-4 grid-cols-2"
        >
          <RadioCard
            value="G"
            disabled={!USER_G}
            title="Classic Account (G address)"
            subtitle="takes native payment"
            icon={<Wallet className="size-4" />}
          />
          <RadioCard
            value="C"
            disabled={!USER_CONTRACT_C}
            title="Contract Account (C address)"
            subtitle="token transfer only"
            icon={<Boxes className="size-4" />}
          />
        </RadioGroup>

        {destType && (
          <>
            <Label className="mb-1.5 block text-foreground">
              Token
            </Label>
            <RadioGroup
              value={tokenKey}
              onValueChange={pickToken}
              aria-label="Token"
              className="sm:grid-cols-3"
            >
              {tokens.map((t) => (
                <RadioCard
                  key={t.key}
                  value={t.key}
                  disabled={!t.enabled}
                  title={t.label}
                  subtitle={t.enabled ? t.symbol : "set env"}
                />
              ))}
            </RadioGroup>
            {selectedToken && (
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedToken.note}
              </p>
            )}
            <Label className="mt-3 mb-1.5 block text-foreground">
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
        accent="blue"
        title="Build the transaction"
        state={stateOf(2, step2Done)}
        locked={!canOpen(2)}
        open={openStep === 2}
        onToggle={() => toggle(2)}
        summary={
          step2Done && committed2 ? (
            <>
              {committed2.amount} {effToken?.symbol} ·{" "}
              {effMechanism === "classic-native"
                ? "classic payment"
                : "contract transfer"}
              {committed2.idMethod !== "none" &&
                ` · ${committed2.idMethod} id ${committed2.idValue}`}
            </>
          ) : undefined
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Set the amount, then see exactly how the exchange constructs and signs
          this transaction for the chosen model.
        </p>

        <Label className="mb-1.5 block text-foreground">
          Amount ({effToken?.symbol})
        </Label>
        <Input
          type="number"
          min="0"
          step="0.0000001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-40"
        />

        {effDestType && (
          <IdMethodPicker
            destType={effDestType}
            avail={idAvail}
            idMethod={idMethod}
            idValue={idValue}
            idValid={idValid}
            onMethod={setIdMethod}
            onValue={setIdValue}
          />
        )}

        {effToken && effDestType && (
          <BuildExplainer
            destType={effDestType}
            tokenSymbol={effToken.symbol}
            mechanism={effToken.mechanism}
            amount={effAmountValid ? effAmount : "amount"}
            idMethod={effIdMethod}
            idValue={effIdValid && effIdValue ? effIdValue : ""}
          />
        )}

        <StepAction
          changed={!!step2Changed}
          committed={step2Done}
          disabled={!canConfirm2}
          onClick={confirmStep2}
        />
      </AccordionStep>

      {/* STEP 3 — Send & confirm */}
      <AccordionStep
        index={3}
        accent="blue"
        title="Send & confirm"
        state={stateOf(3, step3Done)}
        locked={!canOpen(3)}
        open={openStep === 3}
        onToggle={() => toggle(3)}
        summary={
          step3Done && sentInfo ? (
            <span className="text-blue-600">
              sent {effAmount} {effToken?.symbol}
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

        {effToken && effDestType && (
          <TxCodeSnippet
            destType={effDestType}
            tokenKey={effTokenKey}
            tokenSymbol={effToken.symbol}
            mechanism={effToken.mechanism}
            amount={effAmountValid ? effAmount : "1"}
            idMethod={effIdMethod}
            idValue={effIdValid && effIdValue ? effIdValue : DEFAULT_ID}
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
              Send outgoing transfer <ArrowUpFromLine className="size-4" />
            </>
          )}
        </Button>

        {sendStatus === "error" && sendError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Transfer failed</AlertTitle>
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
  idMethod,
  idValue,
}: {
  destType: AccountType;
  tokenSymbol: string;
  mechanism: string;
  amount: string;
  idMethod: WithdrawalIdMethod;
  idValue: string;
}) {
  const isClassic = mechanism === "classic-native";
  const muxed = idMethod === "muxed" && destType === "G";
  const memo = idMethod === "memo";
  const op = isClassic ? "payment" : "invokeHostFunction";
  const id = idValue || "<id>";
  // Contract transfer takes an i128 in the token's base units (stroops),
  // unlike Operation.payment which takes a whole-unit decimal string.
  const stroops = toStroops(Number(amount) > 0 ? amount : "0").toString();

  // A muxed id is folded into the destination as an M… address (a tx-builder
  // setup line); a memo is attached to the transaction, not the operation.
  const muxSetup = muxed
    ? `// fold the base G + id ${id} into one M… address\nconst destination = new MuxedAccount(USER_G, "${id}").accountId();\n\n`
    : "";

  const pseudo = isClassic
    ? `${muxSetup}const tx = new TransactionBuilder(source)
  .addOperation(
    Operation.payment({
      destination: ${muxed ? "destination" : "USER_G"},${
        muxed ? "    // the M… address" : "        // a Classic (G) address"
      }
      asset: Asset.native(),      // XLM
      amount: "${amount}",
    })
  )${memo ? `\n  .addMemo(Memo.id("${id}"))      // routing id on the tx, not the op` : ""}
  .build();`
    : `${muxSetup}const tx = new TransactionBuilder(source)
  .addOperation(
    contract.call(
      "transfer",
      EXCHANGE_G,${" ".repeat(14)}// from — the exchange's own G
      ${
        muxed
          ? "destination,         // to — the M… address"
          : destType === "C"
            ? "USER_CONTRACT_C,     // to — a Contract (C) address"
            : "USER_G,              // to — a Classic (G) address"
      }
      ${stroops}n,${" ".repeat(Math.max(1, 14 - stroops.length))}// ${amount} ${tokenSymbol} in base units (i128, 7 decimals)
    )
  )
  .build();`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 font-mono text-2xs">
          <FileCode2 className="size-3" /> {op}
        </Badge>
        <Badge variant="secondary" className="gap-1 text-2xs">
          <BadgeIcon className="size-3" />
          {isClassic ? "classic-native" : "contract-transfer"}
        </Badge>
      </div>

      <div className="rounded-lg bg-muted/50 p-3">
        <p className="type-eyebrow mb-1.5 text-muted-foreground">
          How it’s built
        </p>
        <ol className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          {buildNarrative(destType, tokenSymbol, isClassic, idMethod, idValue).map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/50" />
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </div>

      <Highlight theme={themes.nightOwl} code={pseudo} language="tsx">
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "overflow-x-auto rounded-lg border p-3 text-2xs leading-relaxed",
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
    </div>
  );
}

function buildNarrative(
  destType: AccountType,
  tokenSymbol: string,
  isClassic: boolean,
  idMethod: WithdrawalIdMethod,
  idValue: string
): React.ReactNode[] {
  const lines: React.ReactNode[] = [];
  const muxed = idMethod === "muxed" && destType === "G";
  const memo = idMethod === "memo";
  const idDisplay = idValue || "the routing id";
  const toClause = muxed ? (
    <>
      <code className="font-mono">to</code> the user’s{" "}
      <code className="font-mono">M…</code> address
    </>
  ) : (
    <>
      <code className="font-mono">to</code>{" "}the user’s G address
    </>
  );

  if (isClassic) {
    lines.push(
      <>
        The exchange builds a single <strong>classic payment operation</strong>{" "}
        on its G account: <code className="font-mono">from</code> the exchange G,{" "}
        {toClause}, moving native XLM. No contract call is involved.
      </>
    );
    lines.push(
      <>
        It signs with the exchange’s key and submits over{" "}
        <DocLink doc="rpc">RPC</DocLink> with{" "}
        <DocLink doc="sendTransaction" code>sendTransaction</DocLink> — no{" "}
        <code className="font-mono">prepareTransaction</code>{" "}needed, since
        there’s no <DocLink doc="soroban">Soroban</DocLink> footprint to compute.
      </>
    );
  } else {
    if (destType === "C") {
      lines.push(
        <>
          A <strong>Contract (C) address can’t receive a classic payment</strong>
          , so even XLM moves through the asset’s{" "}
          <DocLink doc="sac">token contract</DocLink>. The
          exchange invokes <code className="font-mono">transfer</code> with{" "}
          <code className="font-mono">to</code> = the user’s C address.
        </>
      );
    } else {
      lines.push(
        <>
          The exchange invokes the {tokenSymbol} contract’s{" "}
          <code className="font-mono">transfer</code> with{" "}
          <code className="font-mono">from</code> = its own G account and{" "}
          <code className="font-mono">to</code> = the user’s{" "}
          {muxed ? <code className="font-mono">M…</code> : "G"} address.
        </>
      );
    }
    lines.push(
      <>
        Because the exchange G account is <strong>both the transaction source
        and the <code className="font-mono">from</code></strong>, its signature
        satisfies the{" "}
        <DocLink doc="requireAuth" code>require_auth</DocLink> on the
        transfer — its auth entry runs on source-account credentials, so nothing
        separate needs signing.
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

  if (muxed) {
    lines.push(
      <>
        Because the destination carries a routing id, the user’s base G and
        the id <code className="font-mono">{idDisplay}</code> are{" "}
        <strong>folded together into a single muxed{" "}
        <code className="font-mono">M…</code> address</strong>, used as the{" "}
        <code className="font-mono">to</code>. The base G still receives the
        funds — the id just rides along in the address.
      </>
    );
  } else if (memo) {
    lines.push(
      <>
        The routing id is added as a{" "}
        <code className="font-mono">MemoID({idDisplay})</code> on the{" "}
        <strong>payment transaction itself</strong> — the{" "}
        <code className="font-mono">to</code> stays the plain G address.
      </>
    );
  }

  lines.push(
    <>
      Once it lands, the asset contract emits a{" "}
      <DocLink doc="cap67"><strong>CAP-67 unified transfer event</strong></DocLink>{" "}
      with the amount in the data — the same signal for a classic payment, a{" "}
      <DocLink doc="sac">SAC</DocLink> transfer and a{" "}
      <DocLink doc="sep41">SEP-41</DocLink> transfer alike. Only the topic list
      differs: a SAC appends the asset string as a fourth topic, a custom
      SEP-41 token emits just{" "}
      <code className="font-mono">[&quot;transfer&quot;, from, to]</code>.
    </>
  );

  return lines;
}

/** Step-2 control: optionally attach a routing id (muxed / memo) to the destination. */
function IdMethodPicker({
  destType,
  avail,
  idMethod,
  idValue,
  idValid,
  onMethod,
  onValue,
}: {
  destType: AccountType;
  avail: { muxed: boolean; memo: boolean };
  idMethod: WithdrawalIdMethod;
  idValue: string;
  idValid: boolean;
  onMethod: (m: WithdrawalIdMethod) => void;
  onValue: (v: string) => void;
}) {
  return (
    <div className="mt-5">
      <Label className="mb-1.5 block text-foreground">
        Destination routing id (optional)
      </Label>
      <p className="mb-3 text-xs text-muted-foreground">
        If the destination is itself custodial (say, another exchange) it may
        need an id to credit the right user. An <strong>account (G)</strong>{" "}
        carries that id in the address (muxed) or a memo; a{" "}
        <strong>contract (C)</strong>{" "}can’t — its id has to travel as an
        argument inside the <code className="font-mono">transfer</code> call.
      </p>

      <RadioGroup
        value={idMethod}
        onValueChange={(value) => onMethod(value as WithdrawalIdMethod)}
        aria-label="Destination routing id"
        className="sm:grid-cols-3"
      >
        <RadioCard
          value="none"
          title="No id"
          subtitle="plain address"
        />
        <RadioCard
          value="muxed"
          disabled={!avail.muxed}
          title="Muxed id"
          subtitle={avail.muxed ? "M… address" : "G only"}
          icon={<Hash className="size-4" />}
        />
        <RadioCard
          value="memo"
          disabled={!avail.memo}
          title="Memo id"
          subtitle={avail.memo ? "Memo.id" : "classic only"}
          icon={<Tag className="size-4" />}
        />
      </RadioGroup>

      {/* Why an option is unavailable for this destination + token. */}
      {destType === "C" && (
        <DisabledNote>
          <strong>Muxed and memo are off for a contract destination.</strong> A
          muxed address only wraps an <em>account</em> key, so a{" "}
          <code className="font-mono">C…</code>{" "}address can’t be muxed —
          there is no <code className="font-mono">MuxedContract</code>{" "}form. A tx
          memo would ride along but the contract can’t read it. Tagging a transfer to a contract means putting the id in the
          call’s arguments — <strong>the contract has to expose a parameter
          for it</strong>, since the protocol offers no address-level equivalent
          of muxing for a <code className="font-mono">C…</code> destination.
        </DisabledNote>
      )}
      {destType === "G" && !avail.memo && (
        <DisabledNote>
          <strong>Memo is off for a token transfer.</strong> A{" "}
          <code className="font-mono">Memo.id</code> only becomes the on-chain{" "}
          <code className="font-mono">to_muxed_id</code> on a{" "}
          <em>classic payment</em>. For a SAC / SEP-41{" "}
          <code className="font-mono">transfer</code> the id rides in the muxed{" "}
          <code className="font-mono">to</code> address instead — use{" "}
          <strong>Muxed id</strong>.
        </DisabledNote>
      )}

      {idMethod !== "none" && (
        <div className="mt-3">
          <Label className="mb-1.5 block text-foreground">
            {idMethod === "muxed" ? "Muxed id" : "Memo id"} (64-bit, digits only)
          </Label>
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            value={idValue}
            onChange={(e) => onValue(e.target.value)}
            className="w-48 font-mono"
            placeholder="e.g. 1234567"
          />
          {!idValid && (
            <p className="mt-1 text-xs text-destructive">
              Enter a positive whole number (u64).
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {idMethod === "muxed" ? (
              <>
                The id is folded together with the base{" "}
                <code className="font-mono">G</code> into a single{" "}
                <code className="font-mono">M…</code>{" "}address, used as the
                payment’s <code className="font-mono">destination</code>. The
                base <code className="font-mono">G</code> still receives the funds.
              </>
            ) : (
              <>
                The destination stays the plain{" "}
                <code className="font-mono">G</code> address; the id is attached
                as a <code className="font-mono">MemoID</code> on the payment
                transaction itself.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** Small inset note explaining why an id option is unavailable. */
function DisabledNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs leading-relaxed text-muted-foreground">
      <Ban className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
      <span>{children}</span>
    </div>
  );
}

/** Maps a withdrawal token key to the env-derived contract constant name. */
const TOKEN_CONST: Record<string, string> = {
  xlm: "XLM_SAC",
  usdc: "USDC_SAC",
  sep41: "SEP41_TOKEN",
};

/** Build the `const destination = MuxedAccount(...)` snippet line. */
function muxedSetupSnippet(varName: string, id: string): string {
  return `
// Fold the 64-bit routing id into the destination → an M… address.
// The base G still receives the funds; the id surfaces as to_muxed_id.
const ${varName} = new StellarSdk.MuxedAccount(
  new StellarSdk.Account(USER_G, "0"),
  "${id}",
).accountId(); // -> M…
`;
}

/** The real @stellar/stellar-sdk code that builds + submits THIS withdrawal. */
function txCode(
  destType: AccountType,
  tokenKey: string,
  mechanism: string,
  amount: string,
  idMethod: WithdrawalIdMethod,
  idValue: string
): string {
  const dest = destType === "C" ? "USER_CONTRACT_C" : "USER_G";
  // Muxing only wraps an account; memo only routes on a classic payment.
  const useMuxed = idMethod === "muxed" && destType === "G";
  const useMemo =
    idMethod === "memo" && destType === "G" && mechanism === "classic-native";

  if (mechanism === "classic-native") {
    const setup = useMuxed ? muxedSetupSnippet("destination", idValue) : "";
    const paymentDest = useMuxed ? "destination" : "USER_G";
    const memoLine = useMemo
      ? `
  // Memo id → surfaces as to_muxed_id on the transfer event (legacy routing).
  .addMemo(StellarSdk.Memo.id("${idValue}"))`
      : "";
    return `import * as StellarSdk from "@stellar/stellar-sdk";

const server = new StellarSdk.rpc.Server(RPC_URL);
const source = await server.getAccount(EXCHANGE_G);
${setup}
// Classic XLM payment: exchange G account -> user${
      useMuxed ? " (muxed M…)" : " G"
    } address
const tx = new StellarSdk.TransactionBuilder(source, {
  fee: StellarSdk.BASE_FEE,
  networkPassphrase: StellarSdk.Networks.TESTNET,
})
  .addOperation(
    StellarSdk.Operation.payment({
      destination: ${paymentDest},
      asset: StellarSdk.Asset.native(),
      amount: "${amount}",
    })
  )${memoLine}
  .setTimeout(120)
  .build();

tx.sign(exchangeKeypair);
const sent = await server.sendTransaction(tx); // -> { status: "PENDING", hash }`;
  }

  const tokenConst = TOKEN_CONST[tokenKey] ?? "TOKEN_CONTRACT";
  const stroops = toStroops(Number(amount) > 0 ? amount : "0").toString();
  const setup = useMuxed ? muxedSetupSnippet("to", idValue) : "";
  const toLine = useMuxed
    ? `      StellarSdk.Address.fromString(to).toScVal(),          // to (muxed M…)`
    : `      StellarSdk.Address.fromString(${dest}).toScVal(),${
        dest === "USER_G" ? "       " : ""
      } // to${destType === "C" ? " (a C address)" : ""}`;
  return `import * as StellarSdk from "@stellar/stellar-sdk";

const server = new StellarSdk.rpc.Server(RPC_URL);
const source = await server.getAccount(EXCHANGE_G);

// Token transfer: exchange G account invokes transfer(from, to, amount)
const contract = new StellarSdk.Contract(${tokenConst});
${setup}let tx = new StellarSdk.TransactionBuilder(source, {
  // Inclusion fee ceiling (0.2 XLM). prepareTransaction() adds the Soroban
  // resource fee on top — set high so the call isn't priced out; you pay only what's used.
  fee: "2000000",
  networkPassphrase: StellarSdk.Networks.TESTNET,
})
  .addOperation(
    contract.call(
      "transfer",
      StellarSdk.Address.fromString(EXCHANGE_G).toScVal(),  // from
${toLine}
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
  idMethod,
  idValue,
}: {
  destType: AccountType;
  tokenKey: string;
  tokenSymbol: string;
  mechanism: string;
  amount: string;
  idMethod: WithdrawalIdMethod;
  idValue: string;
}) {
  const [open, setOpen] = useState(true);
  const code = txCode(destType, tokenKey, mechanism, amount, idMethod, idValue);
  const label =
    mechanism === "classic-native"
      ? `classic payment · ${tokenSymbol}`
      : `contract transfer · ${tokenSymbol}`;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-4 overflow-hidden rounded-lg border"
    >
      <CollapsibleTrigger
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
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-closed:h-0 motion-reduce:transition-none">
        <Highlight theme={themes.nightOwl} code={code} language="tsx">
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={cn(
                "overflow-x-auto border-t p-3 text-2xs leading-relaxed",
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
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Result panel: tx hash, explorer link, and the emitted CAP-67 event. */
function WithdrawalResult({ info }: { info: WithdrawalSentInfo }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="space-y-0.5">
          <p className="type-title">Sent to the network</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {info.summary}
          </p>
        </div>
      </div>

      <div className="rounded-lg border p-3 text-xs">
        <div className="mb-1.5 flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-2xs">
            CAP-67 transfer event
          </Badge>
          {info.event ? (
            <span className="font-mono font-medium">
              {info.event.amountDisplay}{" "}
              {assetTicker(info.event.asset, info.tokenSymbol)}
            </span>
          ) : (
            <span className="text-muted-foreground">not indexed yet</span>
          )}
        </div>

        {info.event ? (
          <>
            <KV k="topics">{formatTopics(info.event.topicsRaw)}</KV>
            <KV k="data">
              <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-2xs leading-relaxed">
                {info.event.dataRaw}
              </pre>
            </KV>
            <div className="mt-2 flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium">note:</span>
              <p className="break-words">
                {info.event.toMuxedId ? (
                  <>
                    <code className="break-all font-mono">
                      to_muxed_id = {info.event.toMuxedId}
                    </code>{" "}
                    — the {info.idMethod === "memo" ? "memo" : "muxed"} id rode
                    along, so a custodial recipient can credit the right user.
                    The base address still received the funds.
                  </>
                ) : info.idMethod !== "none" ? (
                  <>
                    A {info.idMethod} id ({info.sentId}) was sent, but the event
                    index hasn’t surfaced its{" "}
                    <code className="font-mono">to_muxed_id</code> yet — check
                    the explorer.
                  </>
                ) : (
                  <>
                    No <code className="font-mono">to_muxed_id</code> — the
                    transfer went to a plain address, so the data is just the
                    amount.
                  </>
                )}
              </p>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            The transaction confirmed, but the event index hasn’t caught up
            yet. Open it on the explorer to see the emitted{" "}
            <code className="font-mono">transfer</code> event.
          </p>
        )}

        <a
          href={explorerTxUrl(info.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <ExternalLink className="size-3.5" />
          View on Stellar Expert
          <span className="font-mono text-muted-foreground">
            {shorten(info.hash, 6, 6)}
          </span>
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

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="mt-1">
      <span className="font-medium text-muted-foreground">{k}:</span>{" "}
      <span className="font-mono break-all">{children}</span>
    </div>
  );
}
