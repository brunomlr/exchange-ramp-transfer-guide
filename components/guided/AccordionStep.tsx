"use client";

import { Check, ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "active" | "upcoming";

/** Hue for the completed-step styling. Incoming reads green, outgoing blue. */
const DONE_ACCENT = {
  emerald: {
    border: "border-emerald-300 dark:border-emerald-900/70",
    bg: "bg-emerald-50/50 dark:bg-emerald-950/20",
    icon: "bg-emerald-600 text-white",
    text: "text-emerald-600",
  },
  blue: {
    border: "border-blue-300 dark:border-blue-900/70",
    bg: "bg-blue-50/50 dark:bg-blue-950/20",
    icon: "bg-blue-600 text-white",
    text: "text-blue-600",
  },
} as const;

export function AccordionStep({
  index,
  title,
  state,
  locked,
  open,
  summary,
  onToggle,
  children,
  accent = "emerald",
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
  /** Hue of the completed-step styling. Defaults to green. */
  accent?: keyof typeof DONE_ACCENT;
}) {
  const done = DONE_ACCENT[accent];
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-colors",
        state === "active" && "border-primary/60 shadow-sm ring-1 ring-primary/20",
        state === "done" && done.border,
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
          state === "done" && done.bg
        )}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            state === "active" && "bg-primary text-primary-foreground",
            state === "done" && done.icon,
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
              <span className={cn("text-2xs font-medium", done.text)}>
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
