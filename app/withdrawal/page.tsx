import { GuidedWithdrawal } from "@/components/guided/GuidedWithdrawal";

export const metadata = {
  title: "Guided withdrawal · Exchange Deposit Simulator",
};

export default function GuidedWithdrawalPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Guided withdrawal
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The exchange sends funds out of its own G account to a user&apos;s G
          address or C address. Walk through it one step at a time and see how the
          transaction is built and sent in each model.
        </p>
      </header>
      <GuidedWithdrawal />
    </main>
  );
}
