"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/incoming", label: "Incoming crypto transfer" },
  { href: "/outgoing", label: "Outgoing crypto transfer" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-4 py-2 sm:px-6">
        <Link
          href="/"
          className="mr-3 flex items-center gap-1.5 text-sm font-semibold tracking-tight hover:opacity-80"
        >
          <span
            aria-hidden
            className="flex size-5 items-center justify-center rounded-[5px] bg-primary text-primary-foreground"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8.5h15" />
              <path d="M15 4.5l4 4-4 4" />
              <path d="M20 15.5H5" />
              <path d="M9 11.5l-4 4 4 4" />
            </svg>
          </span>
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
