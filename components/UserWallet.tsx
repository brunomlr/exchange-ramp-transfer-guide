"use client";

import { Loader2, Wallet, CheckCircle2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AddressChip } from "@/components/AddressChip";
import { DocLink } from "@/components/DocLink";
import { cn } from "@/lib/utils";
import {
  USER_G,
  USER_CONTRACT_C,
  EXCHANGE_G,
  DEPOSIT_ID,
  muxedAddress,
  explorerTxUrl,
} from "@/lib/stellar";
import { getTokensForAccount } from "@/lib/tokens";
import type {
  AccountType,
  Addressing,
  SendStatus,
  SentInfo,
  TrackingModel,
} from "@/lib/flow";

interface Props {
  accountType: AccountType | null;
  setAccountType: (t: AccountType) => void;
  model: TrackingModel | null;
  addressing: Addressing;
  setAddressing: (a: Addressing) => void;
  tokenKey: string;
  setTokenKey: (k: string) => void;
  amount: string;
  setAmount: (a: string) => void;
  onSend: () => void;
  sendStatus: SendStatus;
  sendError: string | null;
  sentInfo: SentInfo | null;
  active: boolean;
}

export function UserWallet(props: Props) {
  const {
    accountType,
    setAccountType,
    model,
    addressing,
    setAddressing,
    tokenKey,
    setTokenKey,
    amount,
    setAmount,
    onSend,
    sendStatus,
    sendError,
    sentInfo,
    active,
  } = props;

  const tokens = accountType ? getTokensForAccount(accountType) : [];
  const selectedToken = tokens.find((t) => t.key === tokenKey);
  const isRamp = model === "ramp";
  const memoAllowed =
    !isRamp &&
    accountType === "G" &&
    selectedToken?.mechanism === "classic-native";
  const effectiveAddressing: Addressing =
    accountType === "C" || !memoAllowed ? "muxed" : addressing;

  const muxed = EXCHANGE_G ? muxedAddress(EXCHANGE_G, DEPOSIT_ID) : "";
  const destination = isRamp
    ? EXCHANGE_G
    : effectiveAddressing === "memo"
      ? EXCHANGE_G
      : muxed;
  const sourceAddr = accountType === "C" ? USER_CONTRACT_C : USER_G;

  const sending = sendStatus === "sending";
  const canSend =
    !!accountType &&
    !!model &&
    !!selectedToken?.enabled &&
    !sending &&
    Number(amount) > 0;

  return (
    <Card
      className={cn(
        active && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              <Wallet className="size-4" />
            </span>
            User wallet
          </span>
          {active && (
            <Badge className="bg-primary text-primary-foreground">
              user&apos;s turn
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Source account */}
        <div className="space-y-2">
          <Label className="text-foreground">
            Source account
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <AccountButton
              active={accountType === "G"}
              onClick={() => setAccountType("G")}
              title="Classic (G)"
              subtitle="Payment op"
              disabled={!USER_G}
            />
            <AccountButton
              active={accountType === "C"}
              onClick={() => setAccountType("C")}
              title="Contract (C)"
              subtitle="Soroban call"
              disabled={!USER_CONTRACT_C}
            />
          </div>
          {accountType && (
            <AddressChip
              value={sourceAddr || "— not configured —"}
              className="mt-1"
            />
          )}
        </div>

        {/* Addressing (Exchange model + G only) */}
        {model === "exchange" && accountType === "G" && (
          <div className="space-y-2">
            <Label className="text-foreground">
              Addressing method
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <AccountButton
                active={effectiveAddressing === "muxed"}
                onClick={() => setAddressing("muxed")}
                title="Muxed (M)"
                subtitle="id in address"
              />
              <AccountButton
                active={effectiveAddressing === "memo"}
                onClick={() => memoAllowed && setAddressing("memo")}
                title="G + memo"
                subtitle={memoAllowed ? "id in memo" : "XLM only"}
                disabled={!memoAllowed}
              />
            </div>
          </div>
        )}
        {model === "exchange" && accountType === "C" && (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Contract accounts always use a{" "}
            <DocLink doc="muxed"><strong>muxed</strong></DocLink>{" "}
            destination — <DocLink doc="soroban">Soroban</DocLink> calls
            can&apos;t attach a classic <DocLink doc="memo">memo</DocLink>.
          </p>
        )}
        {isRamp && accountType && (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Ramp model: no <DocLink doc="memo">memo</DocLink> or{" "}
            <DocLink doc="muxed">muxing</DocLink>. The user sends to the ramp&apos;s plain
            address; it identifies the user by <strong>source wallet</strong>,
            with an optional amount.
          </p>
        )}

        {/* Token + amount */}
        {accountType && model && (
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label className="text-foreground">
                Token
              </Label>
              <Select value={tokenKey} onValueChange={(v) => v && setTokenKey(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map((t) => (
                    <SelectItem key={t.key} value={t.key} disabled={!t.enabled}>
                      {t.label}
                      {!t.enabled ? " — set env" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">
                Amount
              </Label>
              <Input
                type="number"
                min="0"
                step="0.0000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
        )}

        {accountType && model && selectedToken && (
          <p className="text-xs text-muted-foreground">{selectedToken.note}</p>
        )}
        {selectedToken && !selectedToken.enabled && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Set <code className="font-mono">{selectedToken.envVar}</code> in
            .env.local to enable this token.
          </p>
        )}

        {/* Destination preview */}
        {accountType && model && selectedToken?.enabled && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="type-title mb-1 flex items-center gap-1.5 text-foreground">
              Destination
              {isRamp && <span> · ramp address (plain)</span>}
              {!isRamp && effectiveAddressing === "memo" && (
                <span>
                  {" "}
                  · memo id <code className="font-mono">{DEPOSIT_ID}</code>
                </span>
              )}
              {!isRamp && effectiveAddressing === "muxed" && (
                <span> · muxed</span>
              )}
            </div>
            <AddressChip value={destination || "—"} />
          </div>
        )}

        {/* Send */}
        {accountType && model && (
          <Button onClick={onSend} disabled={!canSend} className="w-full">
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                Send deposit <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        )}

        {sendStatus === "error" && sendError && (
          <Alert variant="destructive">
            <AlertTitle>Send failed</AlertTitle>
            <AlertDescription className="break-all">
              {sendError}
            </AlertDescription>
          </Alert>
        )}

        {sendStatus === "success" && sentInfo && (
          <Alert>
            <CheckCircle2 className="size-4 text-emerald-600" />
            <AlertTitle>Submitted to the network</AlertTitle>
            <AlertDescription>
              <span>{sentInfo.summary}</span>
              <a
                href={explorerTxUrl(sentInfo.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block font-mono text-xs text-primary hover:underline"
              >
                {sentInfo.hash.slice(0, 16)}… ↗
              </a>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function AccountButton({
  active,
  onClick,
  title,
  subtitle,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </button>
  );
}
