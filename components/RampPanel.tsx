"use client";

import { ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddressChip } from "@/components/AddressChip";
import { DocLink } from "@/components/DocLink";
import { EXCHANGE_G, explorerAccountUrl, shorten } from "@/lib/stellar";
import type { AccountType } from "@/lib/flow";

export function RampPanel({
  accountType,
  sourceAddr,
  amount,
  tokenSymbol,
}: {
  accountType: AccountType | null;
  sourceAddr: string;
  amount: string;
  tokenSymbol: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <ArrowLeftRight className="size-4" />
          </span>
          Ramp — deposit intent
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The ramp creates an intent and tracks the exact{" "}
          <strong>source wallet</strong> and <strong>amount</strong>{" "}
          it expects. No <DocLink doc="memo">memo</DocLink> or{" "}
          <DocLink doc="muxed">muxing</DocLink> — the deposit goes to the ramp&apos;s plain address.
          This is the typical flow when buying a different token at a locked rate
          (rate handling is out of scope for this demo).
        </p>

        <Field label="Send to (ramp address)" badge="destination" highlight>
          <AddressChip
            value={EXCHANGE_G || "— set NEXT_PUBLIC_EXCHANGE_G —"}
            href={EXCHANGE_G ? explorerAccountUrl(EXCHANGE_G) : undefined}
          />
        </Field>

        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Intent — what the ramp watches for
          </p>
          <dl className="space-y-1.5 text-sm">
            <Row k="from (the user's wallet)">
              <span className="font-mono">
                {sourceAddr ? shorten(sourceAddr, 8, 8) : "—"}
              </span>
              {accountType && (
                <Badge
                  variant="outline"
                  className="ml-1.5 h-4 px-1.5 text-[10px]"
                >
                  {accountType}
                </Badge>
              )}
            </Row>
            <Row k="amount">
              <span className="font-mono">
                {amount || "0"} {tokenSymbol}
              </span>
            </Row>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  badge,
  highlight,
  children,
}: {
  label: string;
  badge?: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        highlight ? "rounded-lg border border-primary/50 bg-primary/5 p-3" : "p-0"
      }
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {label}
        </span>
        {badge && (
          <Badge variant="default" className="h-4 px-1.5 text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="flex items-center">{children}</dd>
    </div>
  );
}
