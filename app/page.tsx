import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, ArrowRight } from "lucide-react";
import { DocLink } from "@/components/DocLink";

export const metadata = {
  title: "Guided flows · Ramps / Exchanges",
};

const FLOWS = [
  {
    href: "/deposit",
    icon: ArrowDownToLine,
    accent: "accent-deposit",
    title: "Guided crypto deposit",
    body: "A user sends funds to the ramp or exchange, then the ramp or exchange detects the deposit on-chain from the unified event stream — across the exchange and ramp models.",
  },
  {
    href: "/withdrawal",
    icon: ArrowUpFromLine,
    accent: "accent-withdrawal",
    title: "Guided crypto withdrawal",
    body: "The ramp or exchange sends funds out of its own G account to a user's G address or C address. See how the transaction is built and sent in each model — classic payment vs. contract transfer.",
  },
] as const;

export default function GuidedLandingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="type-page-title">Guided flows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Step-by-step walkthroughs of moving assets to and from a ramp or
          exchange on Stellar — built entirely on{" "}
          <DocLink doc="rpc">RPC</DocLink>. Pick a direction.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {FLOWS.map((f) => {
          const Icon = f.icon;
          return (
            <Link
              key={f.href}
              href={f.href}
              className="group flex flex-col gap-3 rounded-xl border p-5 transition-colors hover:border-primary/60 hover:bg-muted/40"
            >
              <span className={`${f.accent} flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary`}>
                <Icon className="size-5" />
              </span>
              <div className="flex-1">
                <h2 className="type-title">
                  {f.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
              <span className="flex items-center gap-1 text-sm font-medium text-primary">
                Start
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
