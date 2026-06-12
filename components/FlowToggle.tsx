"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type FlowMode = "incoming" | "outgoing";

export function FlowToggle({
  mode,
  onModeChange,
}: {
  mode: FlowMode;
  onModeChange: (m: FlowMode) => void;
}) {
  return (
    <Tabs
      value={mode}
      onValueChange={(v) => onModeChange(v as FlowMode)}
      className="w-full"
    >
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="incoming">Incoming crypto transfer</TabsTrigger>
        <TabsTrigger value="outgoing">Outgoing crypto transfer</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
