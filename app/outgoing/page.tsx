import { GuidedOutgoing } from "@/components/guided/GuidedOutgoing";
import { ArrowUpFromLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Outgoing crypto transfer · Ramps / Exchanges",
};

export default function GuidedOutgoingPage() {
  return (
    <main className="flow-outgoing mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-8">
        <Badge
          variant="outline"
          className="mb-3 gap-1.5 border-flow/20 bg-flow/5 text-flow"
        >
          <ArrowUpFromLine className="size-3" /> Outgoing flow
        </Badge>
        <h1 className="type-page-title">
          Outgoing crypto transfer
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          The ramp or exchange sends crypto out of its own G account to a
          user’s G address or C address — a <strong>withdrawal</strong> in
          the exchange model, an <strong>on-ramp</strong> (fiat in, crypto out)
          in the ramp model. Walk through it one step at a time and see how the
          transaction is built and sent in each model.
        </p>
      </header>
      <GuidedOutgoing />
    </main>
  );
}
