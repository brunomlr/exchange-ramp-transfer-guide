"use client";

import { useEffect, useRef } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Radio,
  ArrowDownToLine,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DocLink } from "@/components/DocLink";
import { fromStroops, shorten, explorerTxUrl } from "@/lib/stellar";
import { useTransferEvents } from "@/lib/useTransferEvents";
import type { DetectedTransfer } from "@/lib/events";
import type { AccountType } from "@/lib/tokens";
import type { Addressing, SentInfo, TrackingModel } from "@/lib/flow";

export interface DetectionCase {
  accountType: AccountType;
  /** "classic-native" | "contract-transfer" */
  mechanism: string;
  model: TrackingModel;
  addressing: Addressing;
  tokenSymbol: string;
  sourceAddr: string;
  /** The exchange-assigned deposit id the intent expects. */
  intentDepositId: string;
  intentAmountStroops: string;
  /** What the user actually sent (may differ from the intent). */
  sentDepositId: string;
  sentAmountStroops: string;
}

export function GuidedDetection({
  exchangeBaseG,
  sentInfo,
  caseInfo,
  persistedTransfer,
  onDetected,
}: {
  exchangeBaseG: string;
  sentInfo: SentInfo | null;
  caseInfo: DetectionCase;
  /** A transfer detected in an earlier session, restored from storage. */
  persistedTransfer?: DetectedTransfer | null;
  onDetected?: (matched: boolean, transfer: DetectedTransfer) => void;
}) {
  const { transfers, latestLedger, error } = useTransferEvents(exchangeBaseG);

  // Pick out the event produced by *our* transaction. Prefer the tx hash;
  // fall back to identity + amount among events at/after our send ledger.
  const mine = findMyTransfer(transfers, sentInfo, caseInfo);

  // The live poll only seeds a handful of recent ledgers, so after a page
  // reload our event has usually scrolled out of the window. Fall back to the
  // transfer persisted by the parent so the detection summary survives a
  // refresh; a fresh live hit always takes precedence.
  const shown = mine ?? persistedTransfer ?? null;

  const verdict = shown ? evaluate(shown, caseInfo) : null;

  const firedRef = useRef(false);
  useEffect(() => {
    if (mine && !firedRef.current) {
      firedRef.current = true;
      onDetected?.(evaluate(mine, caseInfo).matched, mine);
    }
  }, [mine, caseInfo, onDetected]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Radio className="size-3.5" /> polling{" "}
          <code className="font-mono">getEvents</code>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          {latestLedger ? `ledger ${latestLedger}` : "connecting…"}
        </span>
      </div>

      {error && <p className="text-xs text-destructive">RPC: {error}</p>}

      {!shown ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          <ArrowDownToLine className="size-5 motion-safe:animate-bounce" />
          Watching the unified event stream for the user&apos;s transfer…
          <span className="text-xs">
            The detection summary appears automatically once the event lands.
          </span>
        </div>
      ) : (
        <DetectionSummary t={shown} caseInfo={caseInfo} verdict={verdict!} />
      )}
    </div>
  );
}

interface Verdict {
  matched: boolean;
  idOk: boolean;
  amountOk: boolean;
}

function evaluate(t: DetectedTransfer, c: DetectionCase): Verdict {
  const amountOk = t.amount === c.intentAmountStroops;
  if (c.model === "ramp") {
    const fromOk = t.from === c.sourceAddr;
    return { matched: fromOk && amountOk, idOk: fromOk, amountOk };
  }
  // The exchange identifies on the id alone — amount is not part of the match.
  const idOk = t.toMuxedId != null && t.toMuxedId === c.intentDepositId;
  return { matched: idOk, idOk, amountOk };
}

function findMyTransfer(
  transfers: DetectedTransfer[],
  sentInfo: SentInfo | null,
  c: DetectionCase
): DetectedTransfer | null {
  if (!sentInfo) return null;
  const byHash = transfers.find((t) => t.txHash && t.txHash === sentInfo.hash);
  if (byHash) return byHash;
  // Fallback for RPC shapes without txHash: match what we actually sent,
  // only considering events at/after the ledger we submitted in.
  return (
    transfers.find((t) => {
      if (t.ledger < sentInfo.ledger) return false;
      if (t.from !== c.sourceAddr) return false;
      if (t.amount !== c.sentAmountStroops) return false;
      if (c.model === "exchange") return t.toMuxedId === c.sentDepositId;
      return true;
    }) ?? null
  );
}

function DetectionSummary({
  t,
  caseInfo: c,
  verdict,
}: {
  t: DetectedTransfer;
  caseInfo: DetectionCase;
  verdict: Verdict;
}) {
  const ok = verdict.matched;
  const intentAmount = fromStroops(c.intentAmountStroops);
  const sentAmount = fromStroops(t.amount);

  return (
    <div className="space-y-3">
      {/* Verdict banner */}
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-lg border p-3",
          ok
            ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30"
            : "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30"
        )}
      >
        {ok ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
        )}
        <div className="space-y-0.5">
          <p className="type-title">
            {ok ? "Transfer detected & matched" : "Detected, but it doesn’t match the intent"}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {outcomeLine(c, verdict, intentAmount, sentAmount)}
          </p>
        </div>
      </div>

      {/* How detection happened — always visible, no expanding */}
      <div className="rounded-lg bg-muted/50 p-3">
        <p className="type-eyebrow mb-1.5 text-muted-foreground">
          How it was detected
        </p>
        <ol className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          {narrative(c, t).map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/50" />
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* The actual on-chain event */}
      <div className="rounded-lg border p-3 text-xs">
        <div className="mb-1.5 flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-2xs">
            CAP-67 transfer event
          </Badge>
          <span className="font-mono font-medium">
            {sentAmount} {assetSymbol(t.asset)}
          </span>
        </div>
        <KV k="topics">
          [&quot;transfer&quot;, {shorten(t.from)}, {shorten(t.to)}, &quot;
          {t.asset}&quot;]
        </KV>
        <KV k="data">
          <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-2xs leading-relaxed">
            {t.dataRaw}
          </pre>
        </KV>
        <MatchCheck c={c} t={t} verdict={verdict} />
        {t.txHash && (
          <a
            href={explorerTxUrl(t.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <ExternalLink className="size-3.5" />
            View on Stellar Expert
            <span className="font-mono text-muted-foreground">
              {shorten(t.txHash, 6, 6)}
            </span>
          </a>
        )}
      </div>
    </div>
  );
}

/** Step-by-step explanation tailored to the chosen case. */
function narrative(c: DetectionCase, t: DetectedTransfer): React.ReactNode[] {
  const lines: React.ReactNode[] = [];

  if (c.accountType === "C") {
    lines.push(
      <>
        The user sent {c.tokenSymbol} from a{" "}
        <strong>Contract Account (C address)</strong>, which invoked the
        token&apos;s <code className="font-mono">transfer</code>{" "}
        through a contract call.
      </>
    );
  } else if (c.mechanism === "classic-native") {
    lines.push(
      <>
        The user sent a <strong>classic XLM payment</strong> from a{" "}
        <strong>Classic Account (G address)</strong>.
      </>
    );
  } else {
    lines.push(
      <>
        The user sent {c.tokenSymbol} from a{" "}
        <strong>Classic Account (G address)</strong>{" "}by calling the token
        contract&apos;s{" "}
        <code className="font-mono">transfer</code>.
      </>
    );
  }

  lines.push(
    <>
      Either way the movement emitted one{" "}
      <DocLink doc="cap67"><strong>CAP-67 unified transfer event</strong></DocLink>{" "}
      on the {c.tokenSymbol} asset contract — topics{" "}
      <code className="font-mono">[&quot;transfer&quot;, from, to, asset]</code>,
      with the amount (and any id) in the data.
    </>
  );

  if (c.model === "exchange") {
    if (c.addressing === "memo") {
      lines.push(
        <>
          Because the user used a{" "}
          <strong>G address + <DocLink doc="memo">memo</DocLink></strong>, the memo value (
          <code className="font-mono">{t.toMuxedId ?? "—"}</code>) is surfaced in
          the event data as <code className="font-mono">to_muxed_id</code>, while{" "}
          <code className="font-mono">to</code> stays the base G account.
        </>
      );
    } else {
      lines.push(
        <>
          Because the user sent to a{" "}
          <DocLink doc="muxed"><strong>muxed (M)</strong></DocLink> address, the deposit
          id (<code className="font-mono">{t.toMuxedId ?? "—"}</code>) rides in
          the event data as <code className="font-mono">to_muxed_id</code>, while{" "}
          <code className="font-mono">to</code> is the base G account.
        </>
      );
    }
    lines.push(
      <>
        The exchange reads <code className="font-mono">to_muxed_id</code>{" "}from
        every transfer and compares it to the user&apos;s deposit id (
        <code className="font-mono">{c.intentDepositId}</code>) — one universal
        check across XLM, <DocLink doc="sac">SAC</DocLink> and{" "}
        <DocLink doc="sep41">SEP-41</DocLink>. The amount isn&apos;t part of the
        match.
      </>
    );
  } else {
    lines.push(
      <>
        The ramp uses{" "}
        <strong>no <DocLink doc="memo">memo</DocLink> or{" "}
        <DocLink doc="muxed">muxing</DocLink></strong>. It watches for a
        transfer from the user&apos;s wallet (
        <code className="font-mono">{shorten(c.sourceAddr)}</code>) of exactly
        the intent amount (
        <code className="font-mono">{c.intentAmountStroops}</code> stroops) and
        matches on <code className="font-mono">from + amount</code>.
      </>
    );
  }

  return lines;
}

function outcomeLine(
  c: DetectionCase,
  v: Verdict,
  intentAmount: string,
  sentAmount: string
): React.ReactNode {
  if (c.model === "ramp") {
    return v.matched ? (
      <>
        <code className="font-mono">from</code> and{" "}
        <code className="font-mono">amount</code>{" "}match the intent — the ramp
        ties the transfer to the user&apos;s deposit and the token purchase completes.
      </>
    ) : (
      <>
        The amount sent ({sentAmount} {c.tokenSymbol}) doesn&apos;t match the
        intent ({intentAmount} {c.tokenSymbol}). The ramp received the funds at
        its address but can&apos;t match the intent, so the token purchase{" "}
        <strong>won&apos;t complete</strong>.
      </>
    );
  }
  if (!v.idOk) {
    return (
      <>
        <code className="font-mono">to_muxed_id</code>{" "}
        doesn&apos;t match the user&apos;s deposit id (<code className="font-mono">{c.intentDepositId}</code>). The
        exchange received the funds in its base account but can&apos;t attribute
        them to the user, so the deposit intent <strong>won&apos;t complete</strong>.
      </>
    );
  }
  return (
    <>
      <code className="font-mono">to_muxed_id</code>{" "}
      matches the user&apos;s deposit id — the
      deposit is attributed to the user&apos;s account and the intent completes. The amount
      isn&apos;t part of the match for the exchange model.
    </>
  );
}

/**
 * The match check, drawn as a side-by-side comparison: each operand is a
 * labeled value chip, with a colored operator badge between them. The exchange
 * model compares one pair (to_muxed_id vs deposit id); the ramp model compares
 * two (from + amount).
 */
function MatchCheck({
  c,
  t,
  verdict,
}: {
  c: DetectionCase;
  t: DetectedTransfer;
  verdict: Verdict;
}) {
  return (
    <div className="mt-2.5">
      <span className="font-medium text-muted-foreground">match check</span>
      <div className="mt-1.5">
        {c.model === "exchange" ? (
          <CompareRow
            ok={verdict.idOk}
            left={{ label: "to_muxed_id", value: t.toMuxedId ?? "—" }}
            right={{ label: "deposit id", value: c.intentDepositId }}
          />
        ) : (
          <div className="space-y-1.5">
            <CompareRow
              ok={verdict.idOk}
              left={{ label: "from", value: shorten(t.from) }}
              right={{ label: "user wallet", value: shorten(c.sourceAddr) }}
            />
            <CompareRow
              ok={verdict.amountOk}
              left={{ label: "amount", value: fromStroops(t.amount) }}
              right={{ label: "intent", value: fromStroops(c.intentAmountStroops) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CompareRow({
  ok,
  left,
  right,
}: {
  ok: boolean;
  left: { label: string; value: string };
  right: { label: string; value: string };
}) {
  return (
    <div className="flex items-stretch gap-1.5">
      <ValueChip label={left.label} value={left.value} ok={ok} />
      <div className="flex shrink-0 items-center">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-bold",
            ok
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
          )}
        >
          {ok ? "===" : "≠"}
        </span>
      </div>
      <ValueChip label={right.label} value={right.value} ok={ok} />
    </div>
  );
}

function ValueChip({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-md border px-2.5 py-1.5",
        ok
          ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
          : "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30"
      )}
    >
      <div className="type-eyebrow text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "break-all font-mono text-sm",
          ok
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-amber-700 dark:text-amber-400"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function assetSymbol(sep11: string): string {
  if (sep11 === "native") return "XLM";
  return sep11.split(":")[0] || sep11;
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="mt-1">
      <span className="font-medium text-muted-foreground">{k}:</span>{" "}
      <span className="font-mono break-all">{children}</span>
    </div>
  );
}
