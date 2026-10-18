import { GuidedIncoming } from "@/components/guided/GuidedIncoming";
import { ArrowDownToLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Incoming crypto transfer · Exchange & Ramp Transfer Guide",
};

export default function GuidedPage() {
  return (
    <main className="flow-incoming mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-8">
        <Badge
          variant="outline"
          className="mb-3 gap-1.5 border-flow/20 bg-flow/5 text-flow"
        >
          <ArrowDownToLine className="size-3" /> Incoming flow
        </Badge>
        <h1 className="type-page-title">Incoming crypto transfer</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          The user sends crypto from their external wallet to a ramp or exchange
          — a <strong>deposit</strong> in the exchange model, an{" "}
          <strong>off-ramp</strong> (crypto in, fiat out) in the ramp model. Walk
          through it one step at a time and see how the transfer is built, sent,
          and detected on-chain in each model.
        </p>
      </header>
      <GuidedIncoming />
    </main>
  );
}
