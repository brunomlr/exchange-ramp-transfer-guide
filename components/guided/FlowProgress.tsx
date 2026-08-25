import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STEP_LABELS = {
  incoming: ["Choose wallet", "Set tracking", "Send transfer", "Detect event"],
  outgoing: ["Choose destination", "Build transfer", "Send & confirm"],
} as const;

export function FlowProgress({
  direction,
  currentStep,
  completedSteps,
}: {
  direction: keyof typeof STEP_LABELS;
  currentStep: number;
  completedSteps: number;
}) {
  const labels = STEP_LABELS[direction];
  const progress = Math.round((completedSteps / labels.length) * 100);

  return (
    <div className="z-40 -mx-1 bg-background/90 px-1 py-2 backdrop-blur sm:sticky sm:top-[53px]">
      <div className="rounded-xl bg-card px-4 py-3 shadow-xs ring-1 ring-foreground/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Badge
              variant="outline"
              className="shrink-0 border-flow/25 bg-flow/5 text-flow"
            >
              Step {currentStep} of {labels.length}
            </Badge>
            <span className="truncate text-sm font-medium">
              {labels[currentStep - 1]}
            </span>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {progress}% complete
          </span>
        </div>

        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${direction} flow progress`}
          aria-valuemin={0}
          aria-valuemax={labels.length}
          aria-valuenow={completedSteps}
        >
          <div
            className="h-full rounded-full bg-flow transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol
          className={cn(
            "mt-2 hidden gap-2 sm:grid",
            direction === "incoming" ? "grid-cols-4" : "grid-cols-3"
          )}
        >
          {labels.map((label, index) => {
            const step = index + 1;
            const complete = step <= completedSteps;
            const current = step === currentStep;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-1.5 text-2xs text-muted-foreground",
                  current && "font-medium text-foreground",
                  complete && "text-flow"
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold",
                    complete && "border-flow bg-flow text-flow-foreground",
                    current && !complete && "border-flow text-flow"
                  )}
                >
                  {complete ? <Check className="size-2.5" /> : step}
                </span>
                <span className="truncate">{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
