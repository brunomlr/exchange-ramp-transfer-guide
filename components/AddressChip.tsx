"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AddressChipProps {
  value: string;
  href?: string;
  className?: string;
  /** When true, show the full value instead of shortening. */
  full?: boolean;
  mono?: boolean;
}

export function AddressChip({
  value,
  href,
  className,
  full = false,
  mono = true,
}: AddressChipProps) {
  const [copied, setCopied] = useState(false);
  const displayedValue =
    full || value.length <= 30
      ? value
      : `${value.slice(0, 14)}…${value.slice(-10)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5",
        className
      )}
    >
      <span
        className={cn(
        "min-w-0 flex-1 text-xs",
        mono && "font-mono",
        full ? "break-all" : "truncate"
        )}
        title={value}
      >
        {displayedValue}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={copy}
        className="shrink-0 text-muted-foreground"
        aria-label={copied ? "Copied full value" : "Copy full value"}
        title={copied ? "Copied" : "Copy full value"}
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-600" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-primary hover:underline"
        >
          view
        </a>
      )}
    </div>
  );
}
