"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/incoming",
    label: "Incoming crypto transfer",
    shortLabel: "Incoming",
  },
  {
    href: "/outgoing",
    label: "Outgoing crypto transfer",
    shortLabel: "Outgoing",
  },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary navigation"
      className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 sm:flex-nowrap sm:px-6">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg text-sm font-semibold tracking-tight transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs"
            >
              <ArrowLeftRight className="size-4" strokeWidth={2.25} />
            </span>
            <span>Ramps / Exchanges</span>
          </Link>
          <Badge variant="secondary" className="ml-auto sm:ml-0">
            Testnet
          </Badge>
        </div>

        <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1 sm:ml-auto sm:flex sm:w-auto sm:bg-transparent sm:p-0">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-background text-foreground shadow-xs ring-1 ring-foreground/10 sm:bg-primary sm:text-primary-foreground sm:ring-0"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground sm:hover:bg-muted"
                )}
              >
                <span className="sm:hidden">{l.shortLabel}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
