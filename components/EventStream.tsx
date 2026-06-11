"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radio,
  ChevronDown,
  CheckCircle2,
  ArrowDownToLine,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DocLink } from "@/components/DocLink";
import { shorten, explorerTxUrl } from "@/lib/stellar";
import { useTransferEvents } from "@/lib/useTransferEvents";
import {
  matchTransfer,
  type DetectedTransfer,
  type Matcher,
} from "@/lib/events";

function matcherKey(m: Matcher): string {
  return m.model === "exchange"
    ? `e:${m.depositId}`
    : `r:${m.userWallet}:${m.amountStroops}:${m.sinceLedger}`;
}

export function EventStream({
  exchangeBaseG,
  matcher,
  onMatch,
  active,
}: {
  exchangeBaseG: string;
  matcher: Matcher;
  onMatch?: () => void;
  active?: boolean;
}) {
  const { transfers, latestLedger, error } = useTransferEvents(exchangeBaseG);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onMatchRef = useRef(onMatch);
  useEffect(() => {
    onMatchRef.current = onMatch;
  }, [onMatch]);

  // Fire onMatch once per matcher when any visible transfer satisfies it.
  const firedKey = useRef<string | null>(null);
  const key = matcherKey(matcher);
  useEffect(() => {
    if (!onMatchRef.current || firedKey.current === key) return;
    if (transfers.some((t) => matchTransfer(t, matcher))) {
      firedKey.current = key;
      onMatchRef.current();
    }
  }, [key, transfers, matcher]);

  return (
    <Card
      className={cn(
        active && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
              <Radio className="size-4" />
            </span>
            Live deposit detection
          </span>
          <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            polling RPC
            {latestLedger ? ` · ledger ${latestLedger}` : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          Polling <DocLink doc="getEvents" code>getEvents</DocLink> for{" "}
          <code className="font-mono">transfer</code> events — same stream for
          both models. Every transfer (classic payment,{" "}
          <DocLink doc="sac">SAC</DocLink>, or{" "}
          <DocLink doc="sep41">SEP-41</DocLink>) emits{" "}
          <code className="font-mono">
            [&quot;transfer&quot;, from, to, asset]
          </code>
          .{" "}
          {matcher.model === "exchange" ? (
            <>
              <strong>Exchange model:</strong> the data carries{" "}
              <code className="font-mono">to_muxed_id</code>; we match it to
              deposit id <code className="font-mono">{matcher.depositId}</code>.
              For a classic G payment that used a{" "}
              <DocLink doc="memo"><strong>memo</strong></DocLink>, the memo
              arrives as the same <code className="font-mono">to_muxed_id</code>.
            </>
          ) : (
            <>
              <strong>Ramp model:</strong> we match the deposit intent —{" "}
              <code className="font-mono">from</code> equals the user&apos;s wallet and{" "}
              <code className="font-mono">amount</code> equals{" "}
              <code className="font-mono">{matcher.amountStroops}</code> stroops.
              No memo or muxing needed.
            </>
          )}
        </div>

        {error && <p className="text-xs text-destructive">RPC: {error}</p>}

        {transfers.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <ArrowDownToLine className="size-5" />
            Waiting for incoming transfers…
          </div>
        )}

        <ul className="space-y-2">
          {transfers.map((t) => (
            <EventRow
              key={t.eventId}
              t={t}
              matcher={matcher}
              open={expanded.has(t.eventId)}
              onToggle={() => toggle(t.eventId)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function EventRow({
  t,
  matcher,
  open,
  onToggle,
}: {
  t: DetectedTransfer;
  matcher: Matcher;
  open: boolean;
  onToggle: () => void;
}) {
  const matched = matchTransfer(t, matcher);
  return (
    <li
      className={cn(
        "overflow-hidden rounded-lg border transition-colors",
        matched
          ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30"
          : "bg-card"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {matched ? (
              <Badge className="gap-1 bg-emerald-600 text-white">
                <CheckCircle2 className="size-3" /> deposit detected
              </Badge>
            ) : (
              <Badge variant="outline">incoming</Badge>
            )}
            <span className="font-mono text-sm font-medium">
              {t.amountDisplay} {assetSymbol(t.asset)}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            from <span className="font-mono">{shorten(t.from)}</span>
            {matcher.model === "exchange" && t.toMuxedId != null && (
              <>
                {" · "}
                <code className="font-mono">to_muxed_id={t.toMuxedId}</code>
              </>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t bg-muted/20 px-3 py-2.5 text-xs">
          <KV k="event topics">
            [&quot;transfer&quot;, {shorten(t.from)}, {shorten(t.to)}, &quot;
            {t.asset}&quot;]
          </KV>
          <KV k="event data">
            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed">
              {t.dataRaw}
            </pre>
          </KV>
          {matcher.model === "exchange" ? (
            <KV k="match check (to_muxed_id)">
              {t.toMuxedId != null ? (
                <span className={matched ? "text-emerald-600" : ""}>
                  to_muxed_id ({t.toMuxedId}) {matched ? "===" : "≠"} deposit id
                  ({matcher.depositId}){" "}
                  {matched ? "→ ✅ matched" : "→ not this deposit"}
                </span>
              ) : (
                <span>no to_muxed_id (plain transfer, no memo/mux)</span>
              )}
            </KV>
          ) : (
            <KV k="match check (from + amount)">
              <span className={matched ? "text-emerald-600" : ""}>
                from {fromMark(t.from === matcher.userWallet)} · amount{" "}
                {fromMark(t.amount === matcher.amountStroops)}{" "}
                {matched ? "→ ✅ matched intent" : "→ not this intent"}
              </span>
            </KV>
          )}
          {t.txHash && (
            <a
              href={explorerTxUrl(t.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-mono text-primary hover:underline"
            >
              {shorten(t.txHash, 10, 10)} ↗
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function fromMark(ok: boolean) {
  return ok ? "✓" : "✗";
}

function assetSymbol(sep11: string): string {
  if (sep11 === "native") return "XLM";
  return sep11.split(":")[0] || sep11;
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-medium text-muted-foreground">{k}:</span>{" "}
      <span className="font-mono break-all">{children}</span>
    </div>
  );
}
