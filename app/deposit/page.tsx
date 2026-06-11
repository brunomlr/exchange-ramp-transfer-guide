import { GuidedDeposit } from "@/components/guided/GuidedDeposit";

export const metadata = {
  title: "Guided deposit · Ramps / Exchanges",
};

export default function GuidedPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="type-page-title">Guided deposit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The user sends funds from their external wallet to a ramp or exchange.
          Walk through it one step at a time and see how the deposit is built,
          sent, and detected on-chain in each model.
        </p>
      </header>
      <GuidedDeposit />
    </main>
  );
}
