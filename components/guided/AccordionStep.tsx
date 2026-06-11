"use client";

import { Check, ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "active" | "upcoming";

export function AccordionStep({
  index,
  title,
  state,
  locked,
  open,
  summary,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  state: StepState;
  /** Prerequisites not met yet — header is not clickable. */
  locked?: boolean;
  open: boolean;
  /** Shown in the header when the step is collapsed. */
  summary?: React.ReactNode;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-colors",
        state === "active" && "border-primary/60 shadow-sm ring-1 ring-primary/20",
        state === "done" &&
          "border-emerald-300 dark:border-emerald-900/70",
        state === "upcoming" && "border-border",
        locked && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={locked}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
          locked ? "cursor-not-allowed" : "hover:bg-muted/40",
          state === "done" && "bg-emerald-50/50 dark:bg-emerald-950/20"
        )}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            state === "active" && "bg-primary text-primary-foreground",
            state === "done" && "bg-emerald-600 text-white",
            state === "upcoming" &&
              "border border-border bg-muted text-muted-foreground"
          )}
        >
          {state === "done" ? (
            <Check className="size-4" />
          ) : locked ? (
            <Lock className="size-3.5" />
          ) : (
            index
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                state === "upcoming" && "text-muted-foreground"
              )}
            >
              {title}
            </span>
            {state === "done" && !open && (
              <span className="text-[11px] font-medium text-emerald-600">
                done
              </span>
            )}
          </div>
          {!open && summary && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {summary}
            </div>
          )}
        </div>

        {!locked && (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-150 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden" aria-hidden={!open} inert={!open}>
          <div className="border-t px-4 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
