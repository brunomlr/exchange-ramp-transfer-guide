"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
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
  full = true,
  mono = true,
}: AddressChipProps) {
  const [copied, setCopied] = useState(false);

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
          "flex-1 break-all text-xs",
          mono && "font-mono",
          !full && "truncate"
        )}
        title={value}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Copy"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-600" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
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
