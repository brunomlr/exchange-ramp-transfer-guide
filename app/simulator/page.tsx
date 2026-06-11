import DepositFlow from "@/components/DepositFlow";
import { DocLink } from "@/components/DocLink";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="type-page-title">
          Ramps / Exchanges Deposit Simulator
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Send a deposit from a user wallet to a ramp or exchange, then watch it get
          detected in real time using a single <DocLink doc="rpc">RPC</DocLink>-based
          method — reading the{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            to_muxed_id
          </code>{" "}
          on <DocLink doc="cap67">CAP-67</DocLink> unified asset events. No{" "}
          <DocLink doc="horizon">Horizon</DocLink> anywhere.
        </p>
      </header>
      <DepositFlow />
    </main>
  );
}
