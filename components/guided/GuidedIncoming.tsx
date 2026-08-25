"use client";

import { useEffect, useState } from "react";
import {
  Wallet,
  Landmark,
  ArrowLeftRight,
  Hash,
  Target,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  RotateCcw,
  Smartphone,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AddressChip } from "@/components/AddressChip";
import { DocLink } from "@/components/DocLink";
import { AccordionStep, type StepState } from "@/components/guided/AccordionStep";
import { FundsFlowSummary } from "@/components/guided/FundsFlowSummary";
import { FlowProgress } from "@/components/guided/FlowProgress";
import { RadioCard } from "@/components/guided/RadioCard";
import {
  GuidedDetection,
  type DetectionCase,
} from "@/components/guided/GuidedDetection";
import {
  EXCHANGE_G,
  DEPOSIT_ID,
  USER_G,
  USER_CONTRACT_C,
  muxedAddress,
  toStroops,
  explorerTxUrl,
} from "@/lib/stellar";
import { getTokensForAccount } from "@/lib/tokens";
import type { AccountType } from "@/lib/tokens";
import type { DetectedTransfer } from "@/lib/events";
import type {
  Addressing,
  SendStatus,
  SentInfo,
  TrackingModel,
} from "@/lib/flow";

/** The fixed, exchange/ramp-assigned intent for this demo. */
const INTENT_AMOUNT = "1";

/** localStorage key for resuming the guided flow across refreshes. */
const STORAGE_KEY = "guided-incoming-state-v1";

const MODEL_OPTIONS: {
  value: TrackingModel;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  /** What this incoming crypto transfer means to the user in this model. */
  meaning: string;
  detail?: string;
  bullets?: string[];
}[] = [
  {
    value: "exchange",
    title: "Exchange model",
    icon: Landmark,
    tagline: "One omnibus account + a per-user id",
    meaning: "Deposit — the user funds their account.",
    detail:
      "All users deposit to a single shared account. Each user gets a deposit id carried as a memo or muxed id, and the deposit is matched on to_muxed_id.",
  },
  {
    value: "ramp",
    title: "Ramp model",
    icon: ArrowLeftRight,
    tagline: "Tracking a wallet or an off-ramp intent",
    meaning: "Off-ramp — the user sends crypto and receives fiat.",
    bullets: [
      "Persistent address tracking — any incoming crypto transfer from the user's address is processed automatically.",
      "A single off-ramp intent on the user's account, optionally pinned to an amount — needed when the rate is locked to an exact amount, so the transfer must match it.",
    ],
  },
];

export function GuidedIncoming() {
  // Step 1
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [tokenKey, setTokenKey] = useState("");
  // Step 2
  const [model, setModel] = useState<TrackingModel | null>(null);
  // Step 3
  const [addressing, setAddressing] = useState<Addressing>("muxed");
  const [sentAmount, setSentAmount] = useState(INTENT_AMOUNT);
  const [sentDepositId, setSentDepositId] = useState(DEPOSIT_ID);
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<SentInfo | null>(null);
  // Step 4
  const [detectionMatched, setDetectionMatched] = useState<boolean | null>(null);
  // The actual on-chain transfer that was detected — persisted so the
  // detection summary survives a reload even after it scrolls out of the
  // live RPC poll window.
  const [detectedTransfer, setDetectedTransfer] =
    useState<DetectedTransfer | null>(null);

  // Committed snapshots — used to detect a revisit-and-change.
  const [committed1, setCommitted1] = useState<{
    accountType: AccountType;
    tokenKey: string;
  } | null>(null);
  const [committed2, setCommitted2] = useState<{
    model: TrackingModel;
    addressing: Addressing;
  } | null>(null);

  const [openStep, setOpenStep] = useState(1);

  // ---- persistence: resume the wizard across refreshes ----
  // Loaded in an effect (not a useState initializer) so SSR/hydration stays
  // consistent; saving is gated on `ready` so we never clobber storage with
  // the initial defaults before the saved state has been read back.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       one-time hydration from localStorage on mount; a lazy useState
       initializer would read storage during SSR and break hydration. */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.accountType) setAccountType(s.accountType);
        if (typeof s.tokenKey === "string") setTokenKey(s.tokenKey);
        if (s.model) setModel(s.model);
        if (s.addressing) setAddressing(s.addressing);
        if (typeof s.sentAmount === "string") setSentAmount(s.sentAmount);
        if (typeof s.sentDepositId === "string") setSentDepositId(s.sentDepositId);
        // A send that was in-flight when the tab closed can't be resumed.
        setSendStatus(s.sendStatus === "success" ? "success" : "idle");
        if (s.sentInfo) setSentInfo(s.sentInfo);
        if (typeof s.detectionMatched === "boolean")
          setDetectionMatched(s.detectionMatched);
        if (s.detectedTransfer) setDetectedTransfer(s.detectedTransfer);
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
          accountType,
          tokenKey,
          model,
          addressing,
          sentAmount,
          sentDepositId,
          sendStatus: sendStatus === "sending" ? "idle" : sendStatus,
          sentInfo,
          detectionMatched,
          detectedTransfer,
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
    accountType,
    tokenKey,
    model,
    addressing,
    sentAmount,
    sentDepositId,
    sendStatus,
    sentInfo,
    detectionMatched,
    detectedTransfer,
    committed1,
    committed2,
    openStep,
  ]);

  function startOver() {
    setAccountType(null);
    setTokenKey("");
    setModel(null);
    setAddressing("muxed");
    setSentAmount(INTENT_AMOUNT);
    setSentDepositId(DEPOSIT_ID);
    setSendStatus("idle");
    setSendError(null);
    setSentInfo(null);
    setDetectionMatched(null);
    setDetectedTransfer(null);
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
  const tokens = accountType ? getTokensForAccount(accountType) : [];
  const selectedToken = tokens.find((t) => t.key === tokenKey);
  const sourceAddr = accountType === "C" ? USER_CONTRACT_C : USER_G;
  const memoAllowed =
    model === "exchange" &&
    accountType === "G" &&
    selectedToken?.mechanism === "classic-native";
  const effectiveAddressing: Addressing = memoAllowed ? addressing : "muxed";

  const step1Done = !!committed1;
  const step2Done = !!committed2;
  const step3Done = sendStatus === "success" && !!sentInfo;
  const completedSteps =
    Number(step1Done) +
    Number(step2Done) +
    Number(step3Done) +
    Number(detectionMatched !== null);
  const currentProgressStep =
    openStep || (!step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : 4);

  const step1Changed =
    !!committed1 &&
    (committed1.accountType !== accountType || committed1.tokenKey !== tokenKey);
  const step2Changed =
    !!committed2 &&
    (committed2.model !== model ||
      committed2.addressing !== effectiveAddressing);

  // Effective (committed) values — these, not the live inputs, drive every
  // downstream "next-steps" display (the user-instruction preview, the "Next"
  // note, the destination, the detection case) and the actual send. So
  // revisiting a step and changing a selection never alters what's shown for
  // later steps until the user clicks the step's button to re-commit. Before a
  // step's first commit there's no snapshot, so we fall back to the live draft.
  const effAccountType = committed1?.accountType ?? accountType;
  const effTokenKey = committed1?.tokenKey ?? tokenKey;
  const effTokens = effAccountType ? getTokensForAccount(effAccountType) : [];
  const effToken = effTokens.find((t) => t.key === effTokenKey);
  const effTokenLabel = effToken?.symbol;
  const effSourceAddr = effAccountType === "C" ? USER_CONTRACT_C : USER_G;
  const effModel = committed2?.model ?? model;
  const effIsRamp = effModel === "ramp";
  const effAddressing: Addressing = committed2?.addressing ?? effectiveAddressing;

  // ---- resets ----
  function resetSend() {
    setSendStatus("idle");
    setSendError(null);
    setSentInfo(null);
    setDetectionMatched(null);
    setDetectedTransfer(null);
  }
  function clearFrom3() {
    setSentAmount(INTENT_AMOUNT);
    setSentDepositId(DEPOSIT_ID);
    resetSend();
  }
  function clearFrom2() {
    setCommitted2(null);
    setModel(null);
    clearFrom3();
  }

  // ---- step 1 ----
  function pickAccount(t: AccountType) {
    setAccountType(t);
    const first = getTokensForAccount(t).find((x) => x.enabled);
    setTokenKey(first?.key ?? "");
  }
  const canConfirm1 = !!accountType && !!selectedToken?.enabled;
  function confirmStep1() {
    if (!canConfirm1 || !accountType) return;
    if (step1Changed) clearFrom2();
    setCommitted1({ accountType, tokenKey });
    setOpenStep(2);
  }

  // ---- step 2 ----
  function pickModel(value: TrackingModel) {
    if (value === model) return; // keep the addressing already chosen
    setModel(value);
    // Default to the first addressing option ("muxed"). It's valid everywhere —
    // the only case that even offers a choice is the exchange model with classic
    // XLM from a G account, where the user can still switch to "memo".
    setAddressing("muxed");
  }

  function confirmStep2() {
    if (!model) return;
    const firstTime = !committed2;
    if (step2Changed || firstTime) {
      // (re)initialise step 3 to the clean intent
      setSentAmount(INTENT_AMOUNT);
      setSentDepositId(DEPOSIT_ID);
      resetSend();
    }
    setCommitted2({ model, addressing: effectiveAddressing });
    setOpenStep(3);
  }

  // ---- step 3 ----
  const idValid = /^\d+$/.test(sentDepositId);
  const amountValid = Number(sentAmount) > 0;
  const canSend =
    !!effAccountType &&
    !!effModel &&
    !!effToken?.enabled &&
    amountValid &&
    (effIsRamp || idValid) &&
    sendStatus !== "sending";

  const idChanged = !effIsRamp && sentDepositId !== DEPOSIT_ID;
  // Only the ramp model matches on amount; the exchange matches on the id alone.
  const amountChanged =
    effIsRamp && amountValid && toStroops(sentAmount) !== toStroops(INTENT_AMOUNT);

  async function onSend() {
    if (!canSend) return;
    setSendStatus("sending");
    setSendError(null);
    setSentInfo(null);
    setDetectionMatched(null);
    setDetectedTransfer(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType: effAccountType,
          tokenKey: effTokenKey,
          amount: sentAmount,
          addressing: effAddressing,
          model: effModel,
          depositId: sentDepositId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setSentInfo(data as SentInfo);
      setSendStatus("success");
      setOpenStep(4);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Send failed");
      setSendStatus("error");
    }
  }

  // muxed destination preview built from the *sent* id (may be the wrong one).
  const muxedPreview =
    EXCHANGE_G && idValid ? muxedAddress(EXCHANGE_G, sentDepositId) : "";
  const destination = effIsRamp
    ? EXCHANGE_G
    : effAddressing === "memo"
      ? EXCHANGE_G
      : muxedPreview;

  const detectionCase: DetectionCase | null =
    effAccountType && effModel && effToken
      ? {
          accountType: effAccountType,
          mechanism: effToken.mechanism,
          model: effModel,
          addressing: effAddressing,
          tokenSymbol: effToken.symbol,
          sourceAddr: effSourceAddr,
          intentDepositId: DEPOSIT_ID,
          intentAmountStroops: toStroops(INTENT_AMOUNT).toString(),
          sentDepositId,
          sentAmountStroops: toStroops(sentAmount || "0").toString(),
        }
      : null;

  // ---- accordion helpers ----
  function canOpen(n: number) {
    if (n === 1) return true;
    if (n === 2) return step1Done;
    if (n === 3) return step1Done && step2Done;
    return step3Done; // step 4
  }
  function stateOf(n: number, done: boolean): StepState {
    if (openStep === n) return "active";
    if (done) return "done";
    return "upcoming";
  }
  function toggle(n: number) {
    if (!canOpen(n)) return;
    // Leaving a step with an unconfirmed edit reverts the buffer to its
    // committed snapshot — the change only takes effect via the step's
    // "Update selection" button, never by navigating past it.
    if (openStep === 1 && n !== 1 && step1Changed && committed1) {
      setAccountType(committed1.accountType);
      setTokenKey(committed1.tokenKey);
    }
    if (openStep === 2 && n !== 2 && step2Changed && committed2) {
      setModel(committed2.model);
      setAddressing(committed2.addressing);
    }
    setOpenStep((cur) => (cur === n ? 0 : n));
  }

  const idLabel = effAddressing === "memo" ? "Memo id" : "Muxed id";

  return (
    <div className="flow-incoming space-y-3">
      {/* Summary — which way the funds move in this flow */}
      <FundsFlowSummary direction="incoming" />
      <FlowProgress
        direction="incoming"
        currentStep={currentProgressStep}
        completedSteps={completedSteps}
      />

      {/* STEP 1 — User account type & token */}
      <AccordionStep
        index={1}
        title="User account type & token"
        state={stateOf(1, step1Done)}
        open={openStep === 1}
        onToggle={() => toggle(1)}
        summary={
          step1Done &&
          committed1 && (
            <>
              {committed1.accountType === "G"
                ? "Classic Account (G address)"
                : "Contract Account (C address)"}{" "}
              ·{" "}
              {getTokensForAccount(committed1.accountType).find(
                (t) => t.key === committed1.tokenKey
              )?.label}
            </>
          )
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Pick where the incoming transfer comes from and which token to send. A{" "}
          <strong>Classic Account (G address)</strong> sends one of two ways — a{" "}
          <strong>payment op</strong> or a <strong>token call</strong> — and a{" "}
          <strong>Contract Account (C address)</strong> — here an OpenZeppelin
          smart account — drives the token&apos;s{" "}
          <code className="font-mono">transfer</code> through its{" "}
          <code className="font-mono">execute</code> entry point, which it only
          runs against a signature its own{" "}
          <DocLink doc="requireAuth">
            <code className="font-mono">__check_auth</code>
          </DocLink>{" "}
          accepts. All three send paths surface identically in the{" "}
          <DocLink doc="cap67">unified event stream</DocLink>.
        </p>

        <Label className="mb-1.5 block text-foreground">
          Source account
        </Label>
        <RadioGroup
          value={accountType ?? ""}
          onValueChange={(value) => pickAccount(value as AccountType)}
          aria-label="Source account"
          className="mb-4 grid-cols-2"
        >
          <RadioCard
            value="G"
            disabled={!USER_G}
            title="Classic Account (G address)"
            icon={<Wallet className="size-4" />}
          />
          <RadioCard
            value="C"
            disabled={!USER_CONTRACT_C}
            title="Contract Account (C address)"
            icon={<Wallet className="size-4" />}
          />
        </RadioGroup>

        {accountType && (
          <>
            <Label className="mb-1.5 block text-foreground">
              Token
            </Label>
            <RadioGroup
              value={tokenKey}
              onValueChange={setTokenKey}
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
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {selectedToken.note}{" "}
                <span className="italic">
                  However it&apos;s sent, it surfaces as the same transfer event
                  — detection is identical across tokens.
                </span>
              </p>
            )}
            {accountType && (
              <div className="mt-3">
                <Label className="mb-1.5 block text-foreground">
                  User&apos;s external wallet address
                </Label>
                <AddressChip value={sourceAddr || "— not configured —"} />
              </div>
            )}
          </>
        )}

        <StepAction
          changed={!!step1Changed}
          committed={step1Done}
          disabled={!canConfirm1}
          onClick={confirmStep1}
        />
      </AccordionStep>

      {/* STEP 2 — Identification model */}
      <AccordionStep
        index={2}
        title="Identification model"
        state={stateOf(2, step2Done)}
        locked={!canOpen(2)}
        open={openStep === 2}
        onToggle={() => toggle(2)}
        summary={
          step2Done &&
          committed2 && (
            <>{committed2.model === "exchange" ? "Exchange model" : "Ramp model"}</>
          )
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Choose how the Ramp/Exchange identifies the user&apos;s incoming
          transfer. This
          decides the destination and what gets matched on-chain.
        </p>
        <RadioGroup
          value={model ?? ""}
          onValueChange={(value) => pickModel(value as TrackingModel)}
          aria-label="Identification model"
          className="sm:grid-cols-2"
        >
          {MODEL_OPTIONS.map((o) => {
            const Icon = o.icon;
            return (
              <RadioCard
                key={o.value}
                value={o.value}
                title={o.title}
                icon={<Icon className="size-4" />}
                className="p-3"
              >
                <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-foreground/80">
                  {o.value === "exchange" ? (
                    <Hash className="size-3" />
                  ) : (
                    <Target className="size-3" />
                  )}
                  {o.tagline}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                  Incoming transfer = {o.meaning}
                </span>
                {o.detail && (
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    {o.detail}
                  </span>
                )}
                {o.bullets && (
                  <ul className="ml-3 list-disc space-y-1 text-sm leading-relaxed text-muted-foreground">
                    {o.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </RadioCard>
            );
          })}
        </RadioGroup>

        {effModel === "ramp" && (
          <div className="mt-3">
            <div className="type-title mb-1.5 flex items-center gap-1.5 text-foreground">
              <Target className="size-3.5" />
              What the ramp expects
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
            <dl className="space-y-2">
              <div className="flex flex-col gap-1">
                <dt className="type-eyebrow text-muted-foreground/70">
                  From your wallet
                </dt>
                <dd>
                  <AddressChip value={effSourceAddr || "— not configured —"} />
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="type-eyebrow text-muted-foreground/70">
                  Amount
                </dt>
                <dd className="font-mono text-foreground">
                  {INTENT_AMOUNT} {effTokenLabel}
                </dd>
              </div>
            </dl>
            <p className="mt-2">
              For this demo the intent is pinned to{" "}
              <strong>{INTENT_AMOUNT} {effTokenLabel}</strong>{" "}— this matters when
              the rate is quoted for an exact amount. A ramp that doesn&apos;t
              need an amount match can drop that comparison and match on the
              address alone.
            </p>
            </div>
          </div>
        )}

        {/* Addressing scheme — only the exchange + classic XLM case offers a
            choice; it drives both the destination and the preview below. */}
        {memoAllowed && (
          <div className="mt-3">
            <Label className="mb-1.5 block text-foreground">
              How the user addresses the transfer
            </Label>
            <RadioGroup
              value={addressing}
              onValueChange={(value) => setAddressing(value as Addressing)}
              aria-label="Transfer addressing"
              className="grid-cols-2"
            >
              <RadioCard
                value="muxed"
                title="Muxed Address"
                subtitle="id in address"
              />
              <RadioCard
                value="memo"
                title="G Account + Memo"
                subtitle="id in memo"
              />
            </RadioGroup>
          </div>
        )}

        {effModel === "exchange" && effToken && (
          <UserInstructionPreview
            symbol={effToken.symbol ?? "the token"}
            addressing={effAddressing}
            exchangeG={EXCHANGE_G}
            depositId={DEPOSIT_ID}
            muxedAddr={EXCHANGE_G ? muxedAddress(EXCHANGE_G, DEPOSIT_ID) : ""}
          />
        )}

        {effModel && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
            {effModel === "exchange" ? (
              <>
                <strong>Next:</strong>{" "}
                the user sends to a per-user destination —
                a <DocLink doc="muxed"><strong>muxed (M)</strong></DocLink> address,
                or a <strong>G address + <DocLink doc="memo">memo</DocLink></strong>{" "}
                for classic XLM. The id the user
                sends arrives on-chain as <code className="font-mono">to_muxed_id</code>,
                matched against the user&apos;s deposit id{" "}
                <code className="font-mono">{DEPOSIT_ID}</code>.
              </>
            ) : (
              <>
                <strong>Next:</strong> the user sends{" "}
                <strong>{INTENT_AMOUNT}</strong> {effToken?.symbol}{" "}
                from the user&apos;s wallet to the ramp&apos;s plain address. The ramp matches the
                intent on <code className="font-mono">from + amount</code> — no{" "}
                <DocLink doc="memo">memo</DocLink> or{" "}
                <DocLink doc="muxed">muxing</DocLink>. When the ramp is integrated into the wallet, the
                integration already exposes the user&apos;s address, so the user
                has nothing to copy, paste, or enter — they just confirm.
              </>
            )}
          </div>
        )}

        <StepAction
          changed={!!step2Changed}
          committed={step2Done}
          disabled={!model}
          onClick={confirmStep2}
        />
      </AccordionStep>

      {/* STEP 3 — Send the payment */}
      <AccordionStep
        index={3}
        title="Send the transfer"
        state={stateOf(3, step3Done)}
        locked={!canOpen(3)}
        open={openStep === 3}
        onToggle={() => toggle(3)}
        summary={
          step3Done && sentInfo ? (
            <>
              Sent {sentAmount} {effToken?.symbol}
              {!effIsRamp && ` · ${idLabel.toLowerCase()} ${sentDepositId}`}
            </>
          ) : undefined
        }
      >
        {/* The intent (locked) — deposit (exchange) or off-ramp (ramp) */}
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="type-eyebrow mb-2 text-primary">
            {effIsRamp ? "Off-ramp intent (ramp)" : "Deposit intent (exchange)"}
          </p>
          <dl className="space-y-1 text-sm">
            {!effIsRamp ? (
              <IntentRow k="Deposit id">
                <code className="font-mono">{DEPOSIT_ID}</code>
              </IntentRow>
            ) : (
              <>
                <IntentRow k="From (the user's wallet)">
                  <code className="font-mono">{shortenSafe(effSourceAddr)}</code>
                </IntentRow>
                <IntentRow k="Expected amount">
                  <code className="font-mono">
                    {INTENT_AMOUNT} {effToken?.symbol}
                  </code>
                </IntentRow>
              </>
            )}
          </dl>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          This is what the user will actually send.{" "}
          {effIsRamp ? (
            <>
              Leave the amount as-is to match the intent, or change it to
              simulate a user mistake.
            </>
          ) : (
            <>
              Leave the deposit id as-is to match the intent, or change it to
              simulate a user mistake — the exchange matches on the id only, so
              the amount is up to the user.
            </>
          )}
        </p>

        {/* Editable fields */}
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            {!effIsRamp && (
              <div>
                <Label className="mb-1.5 block text-foreground">
                  {idLabel}{" "}
                  <span className="font-normal">(arrives as to_muxed_id)</span>
                </Label>
                <Input
                  inputMode="numeric"
                  value={sentDepositId}
                  onChange={(e) =>
                    setSentDepositId(e.target.value.replace(/[^\d]/g, ""))
                  }
                />
              </div>
            )}
            <div className={effIsRamp ? "col-span-2" : ""}>
              <Label className="mb-1.5 block text-foreground">
                Amount ({effToken?.symbol})
              </Label>
              <Input
                type="number"
                min="0"
                step="0.0000001"
                value={sentAmount}
                onChange={(e) => setSentAmount(e.target.value)}
                className={effIsRamp ? "w-40" : "w-28"}
              />
            </div>
          </div>
        </div>

        {/* Mismatch warning */}
        {(idChanged || amountChanged) && (
          <Alert variant="destructive" className="mt-3">
            <AlertTriangle className="size-4" />
            <AlertTitle>This won&apos;t match the intent</AlertTitle>
            <AlertDescription>{mismatchMessage()}</AlertDescription>
          </Alert>
        )}

        {/* Destination preview */}
        {effToken?.enabled && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3">
            <div className="type-title mb-1 text-foreground">
              Destination
              {effIsRamp
                ? " · ramp address (plain)"
                : effAddressing === "memo"
                  ? ` · memo id ${sentDepositId}`
                  : " · muxed"}
            </div>
            <AddressChip value={destination || "—"} />
          </div>
        )}

        <Button onClick={onSend} disabled={!canSend} className="mt-4 w-full">
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
              Send transfer <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        {sendStatus === "error" && sendError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Send failed</AlertTitle>
            <AlertDescription className="break-all">{sendError}</AlertDescription>
          </Alert>
        )}
        {sendStatus === "success" && sentInfo && (
          <Alert className="mt-3">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <AlertTitle>Submitted to the network</AlertTitle>
            <AlertDescription>
              <span>{sentInfo.summary}</span>
              <a
                href={explorerTxUrl(sentInfo.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block font-mono text-xs text-primary hover:underline"
              >
                {sentInfo.hash.slice(0, 16)}… ↗
              </a>
            </AlertDescription>
          </Alert>
        )}
      </AccordionStep>

      {/* STEP 4 — Detection */}
      <AccordionStep
        index={4}
        title="Transfer detection"
        state={stateOf(
          4,
          detectionMatched !== null
        )}
        locked={!canOpen(4)}
        open={openStep === 4}
        onToggle={() => toggle(4)}
        summary={
          detectionMatched !== null ? (
            detectionMatched ? (
              <span className="text-emerald-600">detected & matched</span>
            ) : (
              <span className="text-amber-600">detected · no intent match</span>
            )
          ) : step3Done ? (
            "watching the event stream…"
          ) : undefined
        }
      >
        {detectionCase ? (
          <GuidedDetection
            exchangeBaseG={EXCHANGE_G}
            sentInfo={sentInfo}
            caseInfo={detectionCase}
            persistedTransfer={detectedTransfer}
            onDetected={(m, t) => {
              setDetectionMatched(m);
              setDetectedTransfer(t);
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Send the transfer first to watch it get detected.
          </p>
        )}
      </AccordionStep>

      {accountType && (
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

  function mismatchMessage(): React.ReactNode {
    if (effIsRamp) {
      return (
        <>
          The transfer will still be sent, but since the amount ({sentAmount}{" "}
          {effToken?.symbol}) doesn&apos;t match the intent ({INTENT_AMOUNT}{" "}
          {effToken?.symbol}), the ramp will receive the funds but{" "}
          <strong>won&apos;t complete the off-ramp intent</strong>.
        </>
      );
    }
    // Exchange model: only a changed deposit id breaks the match.
    return (
      <>
        The transfer will still be sent, but since the {idLabel.toLowerCase()} (
        {sentDepositId || "—"}) doesn&apos;t match the deposit intent (
        {DEPOSIT_ID}), the exchange will receive the funds in its base account
        but <strong>won&apos;t complete the deposit intent</strong>{" "}
        — it can&apos;t attribute the transfer to the user&apos;s account.
      </>
    );
  }
}

/**
 * A mockup of what the *end user* (the exchange customer) would actually see
 * when making this deposit — distinct from the developer-facing mechanics
 * above. It mimics a typical exchange deposit screen. (The ramp model has no
 * such screen: the wallet integration handles addressing, so there's nothing
 * meaningful for the user to see.)
 */
function UserInstructionPreview({
  symbol,
  addressing,
  exchangeG,
  depositId,
  muxedAddr,
}: {
  symbol: string;
  addressing: Addressing;
  exchangeG: string;
  depositId: string;
  muxedAddr: string;
}) {
  return (
    <div className="mt-4">
      <div className="type-title mb-1.5 flex items-center gap-1.5 text-foreground">
        <Smartphone className="size-3.5" />
        Example of instructions an exchange would display to the user
      </div>

      {/*
        A representation of what the exchange would show the user — not part of
        this simulator. Given its own tinted surface (slate) and made
        non-interactive (pointer-events-none / select-none) so it reads as an
        external screen, not UI to click.
      */}
      <div className="pointer-events-none select-none overflow-hidden rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <div className="bg-slate-200/70 px-4 py-2.5 dark:bg-slate-800/70">
          <p className="type-title text-slate-900 dark:text-slate-100">
            Deposit {symbol}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Stellar network
          </p>
        </div>

        <div className="space-y-3 p-4">
          {addressing === "memo" ? (
            <>
              <AppField label="Deposit address" value={exchangeG} />
              <div>
                <p className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="size-3" />
                  Memo — required
                </p>
                <AppValue value={depositId} />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Send with this exact memo. Deposits sent to the address{" "}
                  <strong>without the memo can&apos;t be credited</strong> to
                  your account.
                </p>
              </div>
            </>
          ) : (
            <>
              <AppField label="Your deposit address" value={muxedAddr} />
              <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Info className="mt-0.5 size-3 shrink-0" />
                <span>
                  This address is unique to your account — no memo needed. Send
                  any amount of {symbol} to it.
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A labelled, read-only address row on the exchange's tinted surface. */
function AppField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-title mb-1 text-slate-900 dark:text-slate-100">
        {label}
      </p>
      <AppValue value={value} />
    </div>
  );
}

/** Read-only address value box — no copy/interaction affordance. */
function AppValue({ value }: { value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2.5 dark:bg-slate-950">
      <span className="block break-all font-mono text-xs text-slate-700 dark:text-slate-300">
        {value || "— not configured —"}
      </span>
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
    <Button
      onClick={onClick}
      disabled={disabled}
      variant={changed ? "default" : "default"}
      className="mt-4 w-full"
    >
      {changed ? (
        <>
          <Pencil className="size-4" /> Update selection
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

function IntentRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function shortenSafe(addr: string): string {
  if (!addr) return "—";
  return addr.length <= 13 ? addr : `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}
