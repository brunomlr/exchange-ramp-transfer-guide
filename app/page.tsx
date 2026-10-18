import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, ArrowRight } from "lucide-react";
import { DocLink } from "@/components/DocLink";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Guided flows · Ramps / Exchanges",
};

const FLOWS = [
  {
    href: "/incoming",
    icon: ArrowDownToLine,
    accent: "flow-incoming",
    direction: "Incoming",
    title: "Incoming crypto transfer",
    body: "The user sends crypto to the ramp or exchange, which detects it on-chain from the unified event stream — across the exchange and ramp models.",
    mapping: [
      { model: "Exchange model", meaning: "Deposit — the user funds their account." },
      { model: "Ramp model", meaning: "Off-ramp — the user sends crypto and receives fiat." },
    ],
  },
  {
    href: "/outgoing",
    icon: ArrowUpFromLine,
    accent: "flow-outgoing",
    direction: "Outgoing",
    title: "Outgoing crypto transfer",
    body: "The ramp or exchange sends crypto out of its own G account to a user's G address or C address. See how the transaction is built and sent — a classic payment or a contract transfer, depending on the destination and token.",
    mapping: [
      { model: "Exchange model", meaning: "Withdrawal — the user pulls funds out." },
      { model: "Ramp model", meaning: "On-ramp — the user pays fiat and receives crypto." },
    ],
  },
] as const;

export default function GuidedLandingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 max-w-2xl">
        <Badge variant="outline" className="mb-3 gap-1.5 bg-background">
          Interactive Stellar walkthrough
        </Badge>
        <h1 className="type-page-title">Guided flows</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Step-by-step walkthroughs of moving crypto to and from a ramp or
          exchange on Stellar — built entirely on{" "}
          <DocLink doc="rpc">RPC</DocLink>. Flows are named by the direction of
          the crypto transfer relative to the ramp/exchange; what that means for
          the user depends on the model.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {FLOWS.map((f) => {
          const Icon = f.icon;
          return (
            <Link
              key={f.href}
              href={f.href}
              className={`${f.accent} group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
            >
              <Card className="h-full gap-0 py-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:shadow-md">
                <CardHeader className="gap-4 p-5 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-flow/10 text-flow ring-1 ring-flow/15">
                      <Icon className="size-5" />
                    </span>
                    <Badge
                      variant="outline"
                      className="border-flow/20 bg-flow/5 text-flow"
                    >
                      {f.direction}
                    </Badge>
                  </div>
                  <CardTitle>{f.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 px-5 pb-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                  <dl className="mt-4 space-y-2">
                    {f.mapping.map((m) => (
                      <div
                        key={m.model}
                        className="rounded-lg bg-muted/60 px-3 py-2"
                      >
                        <dt className="text-xs font-semibold text-foreground/80">
                          {m.model}
                        </dt>
                        <dd className="mt-0.5 text-sm text-muted-foreground">
                          {m.meaning}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
                <CardFooter className="justify-between bg-muted/30 px-5 py-3 text-sm font-medium text-foreground">
                  Start walkthrough
                  <ArrowRight className="size-4 text-flow transition-transform group-hover:translate-x-0.5" />
                </CardFooter>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
