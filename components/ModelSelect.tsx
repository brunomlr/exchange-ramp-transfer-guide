"use client";

import { Landmark, ArrowLeftRight, Hash, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TrackingModel } from "@/lib/flow";

const OPTIONS: {
  value: TrackingModel;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  detail?: string;
  bullets?: string[];
}[] = [
  {
    value: "exchange",
    title: "Exchange model",
    icon: Landmark,
    tagline: "One omnibus account + a per-user id",
    detail:
      "All users deposit to a single shared account. Each user gets a deposit id carried as a memo or muxed id, and the deposit is matched on to_muxed_id.",
  },
  {
    value: "ramp",
    title: "Ramp model",
    icon: ArrowLeftRight,
    tagline: "Tracking a wallet or a deposit intent",
    bullets: [
      "Persistent address tracking — any incoming deposit from the user's address is processed automatically.",
      "A single deposit intent on the user's account, optionally pinned to an amount — used for locked-token cases where the deposit must match exactly.",
    ],
  },
];

export function ModelSelect({
  model,
  setModel,
  active,
}: {
  model: TrackingModel | null;
  setModel: (m: TrackingModel) => void;
  active: boolean;
}) {
  return (
    <Card
      className={cn(
        active && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <Landmark className="size-4" />
            </span>
            Ramp / Exchange
          </span>
          {active && (
            <Badge className="bg-primary text-primary-foreground">
              user&apos;s turn
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Choose how the Ramp/Exchange identifies the user&apos;s deposit. This
          decides the destination and how the payment is tracked.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const selected = model === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setModel(o.value)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-sm font-medium">{o.title}</span>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                  {o.value === "exchange" ? (
                    <Hash className="size-3" />
                  ) : (
                    <Target className="size-3" />
                  )}
                  {o.tagline}
                </span>
                {o.detail && (
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {o.detail}
                  </span>
                )}
                {o.bullets && (
                  <ul className="ml-3 list-disc space-y-1 text-xs leading-relaxed text-muted-foreground">
                    {o.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
