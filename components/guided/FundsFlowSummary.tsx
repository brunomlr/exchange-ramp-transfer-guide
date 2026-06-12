"use client";

import { Wallet, Landmark, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type FlowDirection = "incoming" | "outgoing";

const USER_NODE = {
  icon: Wallet,
  title: "User wallet",
  subtitle: "external Stellar account",
};

const EXCHANGE_NODE = {
  icon: Landmark,
  title: "Ramp / Exchange",
  subtitle: "hot wallet",
};

/**
 * A compact, at-a-glance summary of which way the funds move in this flow:
 * incoming = user → ramp/exchange, outgoing = ramp/exchange → user.
 * Purely illustrative — it frames the steps below, it doesn't drive them.
 */
export function FundsFlowSummary({ direction }: { direction: FlowDirection }) {
  const isDeposit = direction === "incoming";
  // Funds always flow left → right in the diagram; only the endpoints swap.
  const from = isDeposit ? USER_NODE : EXCHANGE_NODE;
  const to = isDeposit ? EXCHANGE_NODE : USER_NODE;

  return (
    <div className="mb-5">
      <p className="type-eyebrow mb-2.5 text-muted-foreground">
        Flow of crypto
      </p>
      <div className="flex items-stretch gap-2 sm:gap-3">
        <FlowNode node={from} role="from" />

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1">
          <span className="type-eyebrow text-primary">
            {isDeposit ? "Incoming" : "Outgoing"}
          </span>
          <div className="flex w-full items-center">
            <span className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-primary/20 to-primary/60" />
            <ArrowRight className="-ml-1 size-4 shrink-0 text-primary" />
          </div>
          <span className="truncate text-2xs text-muted-foreground">
            crypto moves this way
          </span>
        </div>

        <FlowNode node={to} role="to" />
      </div>
    </div>
  );
}

function FlowNode({
  node,
  role,
}: {
  node: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string };
  role: "from" | "to";
}) {
  const Icon = node.icon;
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-center",
        role === "to"
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-background"
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full",
          role === "to"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="text-xs font-medium leading-tight">{node.title}</span>
      <span className="text-2xs leading-tight text-muted-foreground">
        {node.subtitle}
      </span>
    </div>
  );
}
