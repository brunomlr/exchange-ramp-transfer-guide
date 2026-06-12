"use client";

import { Info, ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocLink } from "@/components/DocLink";
import { STEPS, activeSide, type TrackingModel } from "@/lib/flow";

function getCopy(
  step: number,
  model: TrackingModel | null
): { title: string; body: React.ReactNode } {
  switch (step) {
    case 1:
      return {
        title: "Step 1 — Choose the source account",
        body: (
          <>
            Pick where the incoming transfer comes from. A{" "}
            <strong>Classic account (G…)</strong> sends with a normal payment
            operation; a <strong>Contract account (C…)</strong> sends by invoking
            a token contract. Both are detected from the same event stream.
          </>
        ),
      };
    case 2:
      return {
        title: "Step 2 — Choose how the Ramp/Exchange identifies the user",
        body: (
          <>
            <strong>Exchange model</strong> uses one shared omnibus account and a
            per-user deposit id (carried as a <DocLink doc="memo">memo</DocLink>{" "}
            or <DocLink doc="muxed">muxed id</DocLink>).{" "}
            <strong>Ramp model</strong>{" "}creates an off-ramp intent pinned to the
            user&apos;s wallet address, with an optional amount — typical when
            buying a different token at a locked rate. The choice decides the
            destination and how the payment is tracked.
          </>
        ),
      };
    case 3:
      return model === "ramp"
        ? {
            title: "Step 3 — Set the amount for the user's off-ramp intent",
            body: (
              <>
                Choose a token and amount. The ramp arms an intent watching for a
                transfer <strong>from the user&apos;s wallet</strong> of{" "}
                <strong>exactly that amount</strong>, sent to its plain address —
                no <DocLink doc="memo">memo</DocLink> or{" "}
                <DocLink doc="muxed">muxing</DocLink>.
              </>
            ),
          }
        : {
            title: "Step 3 — Pick addressing & token",
            body: (
              <>
                A <strong>G account</strong> can deposit to the{" "}
                <DocLink doc="muxed"><strong>muxed</strong></DocLink> address or to the{" "}
                <strong>G address + <DocLink doc="memo">memo</DocLink></strong>{" "}
                (classic XLM only). A <strong>C account</strong> always uses{" "}
                <DocLink doc="muxed">muxing</DocLink>. Then choose a token
                and amount — the destination on the right updates to match.
              </>
            ),
          };
    case 4:
      return {
        title: "Step 4 — Send the transfer",
        body: (
          <>
            The transaction is built, signed, and submitted via{" "}
            <DocLink doc="rpc"><strong>Stellar RPC</strong></DocLink> (
            <DocLink doc="sendTransaction" code>sendTransaction</DocLink>) — classic
            and contract transactions alike. No{" "}
            <DocLink doc="horizon">Horizon</DocLink> is involved.
          </>
        ),
      };
    case 5:
      return model === "ramp"
        ? {
            title: "Step 5 — Detect it on-chain (intent match)",
            body: (
              <>
                The ramp polls <DocLink doc="getEvents" code>getEvents</DocLink> for{" "}
                <code className="font-mono">transfer</code> events and matches the
                intent: <code className="font-mono">from</code> = the user&apos;s wallet and{" "}
                <code className="font-mono">amount</code> = the expected amount.
              </>
            ),
          }
        : {
            title: "Step 5 — Detect it on-chain (id match)",
            body: (
              <>
                The exchange polls <DocLink doc="getEvents" code>getEvents</DocLink>{" "}
                for <code className="font-mono">transfer</code> events. Every
                transfer carries <code className="font-mono">to_muxed_id</code> in
                its data — matching it to the deposit id identifies the user with
                one universal check.
              </>
            ),
          };
    default:
      return getCopy(1, model);
  }
}

export function InfoBox({
  step,
  model,
}: {
  step: number;
  model: TrackingModel | null;
}) {
  const copy = getCopy(step, model);
  const side = activeSide(step);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "upcoming";
          return (
            <span
              key={label}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium",
                state === "active" &&
                  "border-primary bg-primary text-primary-foreground",
                state === "done" &&
                  "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                state === "upcoming" && "border-border text-muted-foreground"
              )}
            >
              <span className="tabular-nums">{n}</span>
              <span className="hidden sm:inline">{label}</span>
            </span>
          );
        })}
      </div>
      <div className="flex gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">{copy.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            {copy.body}
          </p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
            {side === "left" ? (
              <>
                <ArrowLeft className="size-3" /> interact on the left (user
                wallet)
              </>
            ) : (
              <>
                interact on the right (Ramp/Exchange){" "}
                <ArrowRight className="size-3" />
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
