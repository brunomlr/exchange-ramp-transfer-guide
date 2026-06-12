import { GuidedIncoming } from "@/components/guided/GuidedIncoming";

export const metadata = {
  title: "Incoming crypto transfer · Ramps / Exchanges",
};

export default function GuidedPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="type-page-title">Incoming crypto transfer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
