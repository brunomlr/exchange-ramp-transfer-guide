import { GuidedOutgoing } from "@/components/guided/GuidedOutgoing";

export const metadata = {
  title: "Outgoing crypto transfer · Ramps / Exchanges",
};

export default function GuidedOutgoingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="type-page-title">
          Outgoing crypto transfer
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The ramp or exchange sends crypto out of its own G account to a
          user&apos;s G address or C address — a <strong>withdrawal</strong> in
          the exchange model, an <strong>on-ramp</strong> (fiat in, crypto out)
          in the ramp model. Walk through it one step at a time and see how the
          transaction is built and sent in each model.
        </p>
      </header>
      <GuidedOutgoing />
    </main>
  );
}
