"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export function RadioCard({
  value,
  disabled,
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  value: string;
  disabled?: boolean;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const controlId = useId();

  return (
    <Label
      htmlFor={controlId}
      className={cn(
        "relative flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors has-data-checked:border-primary has-data-checked:bg-primary/5 has-data-checked:ring-1 has-data-checked:ring-primary/30 hover:bg-muted/50",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        children && "items-start",
        className
      )}
    >
      {icon && <span className="mt-0.5 shrink-0 text-primary">{icon}</span>}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
        {children}
      </div>
      <RadioGroupItem
        id={controlId}
        value={value}
        disabled={disabled}
        aria-label={title}
        className="mt-0.5"
      />
    </Label>
  );
}
