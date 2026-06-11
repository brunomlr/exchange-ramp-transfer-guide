"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/deposit", label: "Guided deposit" },
  { href: "/withdrawal", label: "Guided withdrawal" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4 py-2 sm:px-6">
        <Link
          href="/"
          className="mr-3 text-sm font-semibold tracking-tight hover:opacity-80"
        >
          Ramps / Exchanges
        </Link>
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
