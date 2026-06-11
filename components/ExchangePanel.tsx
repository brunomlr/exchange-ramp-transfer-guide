"use client";

import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddressChip } from "@/components/AddressChip";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_ID,
  EXCHANGE_G,
  muxedAddress,
  explorerAccountUrl,
} from "@/lib/stellar";
import type { AccountType, Addressing } from "@/lib/flow";

export function ExchangePanel({
  accountType,
  addressing,
}: {
  accountType: AccountType | null;
  addressing: Addressing;
}) {
  const muxed = EXCHANGE_G ? muxedAddress(EXCHANGE_G, DEPOSIT_ID) : "";
  // C accounts always mux; G accounts honor the chosen addressing.
  const usingMemo = accountType === "G" && addressing === "memo";
  const usingMuxed = !usingMemo;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <Building2 className="size-4" />
          </span>
          Exchange — deposit details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Assigned by the exchange and not editable. The deposit id ties an
          incoming payment to the user&apos;s account.
        </p>

        <Field
          label="Base account (G)"
          highlight={usingMemo}
          badge={usingMemo ? "destination" : undefined}
        >
          <AddressChip
            value={EXCHANGE_G || "— set NEXT_PUBLIC_EXCHANGE_G —"}
            href={EXCHANGE_G ? explorerAccountUrl(EXCHANGE_G) : undefined}
          />
        </Field>

        <Field label="Deposit id (memo id)" highlight={usingMemo}>
          <div className="flex items-center gap-2">
            <code className="rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-sm">
              {DEPOSIT_ID}
            </code>
            <span className="text-xs text-muted-foreground">
              surfaces as <code className="font-mono">to_muxed_id</code>
            </span>
          </div>
        </Field>

        <Field
          label="Muxed address (M)"
          highlight={usingMuxed}
          badge={usingMuxed ? "destination" : undefined}
        >
          <AddressChip value={muxed || "— exchange G not set —"} />
        </Field>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  highlight,
  badge,
  children,
}: {
  label: string;
  highlight?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        highlight ? "border-primary/50 bg-primary/5" : "border-transparent"
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="type-title text-foreground">
          {label}
        </span>
        {badge && (
          <Badge variant="default" className="h-4 px-1.5 text-2xs">
            {badge}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}
