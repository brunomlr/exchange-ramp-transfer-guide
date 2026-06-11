"use client";

import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FlowToggle, type FlowMode } from "@/components/FlowToggle";
import { InfoBox } from "@/components/InfoBox";
import { UserWallet } from "@/components/UserWallet";
import { ModelSelect } from "@/components/ModelSelect";
import { ExchangePanel } from "@/components/ExchangePanel";
import { RampPanel } from "@/components/RampPanel";
import { EventStream } from "@/components/EventStream";
import {
  EXCHANGE_G,
  DEPOSIT_ID,
  USER_G,
  USER_CONTRACT_C,
  rpcServer,
  toStroops,
} from "@/lib/stellar";
import { getTokensForAccount, findToken } from "@/lib/tokens";
import type { Matcher } from "@/lib/events";
import type {
  AccountType,
  Addressing,
  SendStatus,
  SentInfo,
  TrackingModel,
} from "@/lib/flow";

export default function DepositFlow() {
  const [mode, setMode] = useState<FlowMode>("deposit");
  const [accountType, setAccountTypeRaw] = useState<AccountType | null>(null);
  const [model, setModelRaw] = useState<TrackingModel | null>(null);
  const [addressing, setAddressing] = useState<Addressing>("muxed");
  const [tokenKey, setTokenKey] = useState("");
  const [amount, setAmount] = useState("1");

  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<SentInfo | null>(null);
  const [detected, setDetected] = useState(false);
  const [rampSinceLedger, setRampSinceLedger] = useState<number | null>(null);

  function resetSend() {
    setSendStatus("idle");
    setSendError(null);
    setSentInfo(null);
    setDetected(false);
    setRampSinceLedger(null);
  }

  function setAccountType(t: AccountType) {
    setAccountTypeRaw(t);
    resetSend();
    const first = getTokensForAccount(t).find((x) => x.enabled);
    setTokenKey(first?.key ?? "");
    if (t === "C") setAddressing("muxed");
  }

  function setModel(m: TrackingModel) {
    setModelRaw(m);
    resetSend();
  }

  const sourceAddr = accountType === "C" ? USER_CONTRACT_C : USER_G;
  const selectedToken = accountType
    ? findToken(accountType, tokenKey)
    : undefined;
  const tokenSymbol = selectedToken?.symbol ?? "XLM";

  async function onSend() {
    setSendStatus("sending");
    setSendError(null);
    setSentInfo(null);
    try {
      // Arm the ramp intent: only count deposits from this ledger onward.
      if (model === "ramp") {
        try {
          const l = await rpcServer().getLatestLedger();
          setRampSinceLedger(l.sequence);
        } catch {
          /* matcher falls back to a safe high watermark */
        }
      }
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType, tokenKey, amount, addressing, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setSentInfo(data as SentInfo);
      setSendStatus("success");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Send failed");
      setSendStatus("error");
    }
  }

  const matcher: Matcher = useMemo(() => {
    if (model === "ramp") {
      return {
        model: "ramp",
        userWallet: sourceAddr,
        amountStroops: toStroops(amount || "1").toString(),
        sinceLedger: rampSinceLedger ?? Number.MAX_SAFE_INTEGER,
      };
    }
    return { model: "exchange", depositId: DEPOSIT_ID };
  }, [model, sourceAddr, amount, rampSinceLedger]);

  const step = useMemo(() => {
    if (!accountType) return 1;
    if (!model) return 2;
    if (sendStatus === "sending") return 4;
    if (sendStatus === "success" || detected) return 5;
    return 3;
  }, [accountType, model, sendStatus, detected]);

  return (
    <div className="space-y-5">
      <FlowToggle mode={mode} onModeChange={setMode} />

      {mode === "withdrawal" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Clock className="size-5" />
            </span>
            <p className="text-sm font-medium">Withdrawals are coming soon</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              This simulator currently covers the deposit flow. Switch back to{" "}
              <strong>Deposit</strong> to send and detect a payment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <InfoBox step={step} model={model} />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <UserWallet
              accountType={accountType}
              setAccountType={setAccountType}
              model={model}
              addressing={addressing}
              setAddressing={setAddressing}
              tokenKey={tokenKey}
              setTokenKey={setTokenKey}
              amount={amount}
              setAmount={setAmount}
              onSend={onSend}
              sendStatus={sendStatus}
              sendError={sendError}
              sentInfo={sentInfo}
              active={step === 1 || step === 3 || step === 4}
            />
            <div className="space-y-5">
              <ModelSelect
                model={model}
                setModel={setModel}
                active={step === 2}
              />
              {model === "exchange" && (
                <ExchangePanel accountType={accountType} addressing={addressing} />
              )}
              {model === "ramp" && (
                <RampPanel
                  accountType={accountType}
                  sourceAddr={sourceAddr}
                  amount={amount}
                  tokenSymbol={tokenSymbol}
                />
              )}
              <EventStream
                exchangeBaseG={EXCHANGE_G}
                matcher={matcher}
                onMatch={() => setDetected(true)}
                active={step === 5}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
